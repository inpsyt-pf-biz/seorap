-- 여러 행을 한 번에 바꾸는 일은 여기서 원자적으로 처리한다 (Plan A)

create function app.otp_register_failure(p_id uuid, p_lock_minutes int)
returns table (out_attempt_count int, out_max_attempts int, out_locked_until timestamptz)
language sql set search_path = app, public as $$
  update app.otp_challenges
     set attempt_count = attempt_count + 1,
         locked_until = case when attempt_count + 1 >= max_attempts then now() + make_interval(mins => p_lock_minutes) else locked_until end
   where id = p_id and consumed_at is null
  returning attempt_count, max_attempts, locked_until;
$$;

create function app.otp_consume(p_id uuid)
returns boolean
language sql set search_path = app, public as $$
  with u as (update app.otp_challenges set consumed_at = now() where id = p_id and consumed_at is null
                   and expires_at > now() and attempt_count < max_attempts and (locked_until is null or locked_until <= now())
                 returning id)
  select exists (select 1 from u);
$$;

create function app.voucher_mark_exposed(p_voucher_id uuid, p_launch boolean, p_launched_by text default 'recipient')
returns void
language sql set search_path = app, public as $$
  update app.vouchers
     set first_code_exposed_at = coalesce(first_code_exposed_at, now()),
         first_launched_at = case when p_launch then coalesce(first_launched_at, now()) else first_launched_at end,
         last_launched_at = case when p_launch then now() else last_launched_at end,
         launched_by = case when p_launch then coalesce(launched_by, p_launched_by) else launched_by end,
         updated_at = now()
   where id = p_voucher_id;
$$;

create function app.forward_counts(p_recipient_id uuid, p_voucher_id uuid, p_to_phone_hash text, p_day_start timestamptz)
returns table (out_voucher_today int, out_box_today int, out_last_same_number timestamptz, out_unused int)
language sql stable set search_path = app, public as $$
  with mine as (
    select v.id from app.vouchers v join app.orders o on o.id = v.order_id where o.recipient_id = p_recipient_id
  )
  select
    (select count(*)::int from app.voucher_forwards f
      where f.voucher_id = p_voucher_id and f.action in ('forward', 'resend') and f.created_at >= p_day_start),
    (select count(*)::int from app.voucher_forwards f
      where f.voucher_id in (select id from mine) and f.action in ('forward', 'resend') and f.created_at >= p_day_start),
    (select max(f.created_at) from app.voucher_forwards f
      where f.voucher_id in (select id from mine) and f.to_phone_hash = p_to_phone_hash and f.action in ('forward', 'resend')),
    (select count(*)::int from app.vouchers v
      where v.id in (select id from mine) and v.issue_status = 'issued' and v.cancel_status = 'none'
        and v.first_launched_at is null and v.current_forward_id is null and cardinality(v.lock_reasons) = 0);
$$;

create function app.forward_apply(
  p_action text,
  p_voucher_id uuid,
  p_client_request_id text,
  p_actor_type text,
  p_token_hash text,
  p_link_ttl_days int,
  p_to_name_enc text default null,
  p_to_name_masked text default null,
  p_to_phone_enc text default null,
  p_to_phone_hash text default null,
  p_to_phone_last4 text default null,
  p_is_self boolean default false
)
returns table (out_forward_id uuid, out_message_id uuid, out_access_link_id uuid, out_created boolean)
language plpgsql set search_path = app, public as $$
declare
  v_existing app.voucher_forwards%rowtype;
  v_current app.voucher_forwards%rowtype;
  v_current_link app.access_links%rowtype;
  v_forward_id uuid := gen_random_uuid();
  v_msg_id uuid := null;
  v_link_id uuid := null;
begin
  if p_action not in ('forward', 'resend', 'cancel', 'direct_share') then
    raise exception 'INVALID_ACTION';
  end if;

  -- 같은 요청 ID는 한 번만 처리 (연타)
  select * into v_existing from app.voucher_forwards where client_request_id = p_client_request_id and voucher_id = p_voucher_id;
  if found then
    return query select v_existing.id, v_existing.message_id, v_existing.access_link_id, false;
    return;
  end if;

  perform 1 from app.vouchers where id = p_voucher_id for update;
  select f.* into v_current from app.vouchers v join app.voucher_forwards f on f.id = v.current_forward_id where v.id = p_voucher_id;

  if p_action in ('forward', 'direct_share') and v_current.id is not null then
    raise exception 'ALREADY_FORWARDED';
  end if;
  if p_action in ('resend', 'cancel') and v_current.id is null then
    raise exception 'NO_ACTIVE_FORWARD';
  end if;
  if p_action = 'resend' and v_current.delivery_mode = 'direct_share' then
    raise exception 'NOT_RESENDABLE';
  end if;

  if p_action = 'cancel' then
    select * into v_current_link from app.access_links where voucher_id = p_voucher_id and link_type = 'forward' and revoked_at is null;
    if v_current_link.code_exposed_at is not null then
      raise exception 'CODE_EXPOSED';
    end if;
    update app.access_links set revoked_at = now(), revoked_reason = 'forward_cancelled', revoked_by = p_actor_type
     where voucher_id = p_voucher_id and link_type = 'forward' and revoked_at is null;
    insert into app.voucher_forwards (id, voucher_id, action, resend_of_forward_id, actor_type, client_request_id, delivery_mode)
    values (v_forward_id, p_voucher_id, 'cancel', v_current.id, p_actor_type, p_client_request_id, v_current.delivery_mode);
    update app.vouchers set current_forward_id = null, updated_at = now() where id = p_voucher_id;
    return query select v_forward_id, null::uuid, null::uuid, true;
    return;
  end if;

  -- forward / resend / direct_share: 새 링크를 만들고, 다시 보내기면 옛 링크를 닫는다
  -- 다시 보내기는 옛 링크의 코드 노출 기록을 새 링크로 이어 받는다 (취소 차단을 우회하지 못하게)
  if p_action = 'resend' then
    select * into v_current_link from app.access_links where voucher_id = p_voucher_id and link_type = 'forward' and revoked_at is null;
  end if;
  update app.access_links set revoked_at = now(), revoked_reason = 'resent', revoked_by = p_actor_type
   where voucher_id = p_voucher_id and link_type = 'forward' and revoked_at is null;

  v_link_id := gen_random_uuid();
  if p_action <> 'direct_share' then
    v_msg_id := gen_random_uuid();
  end if;

  insert into app.voucher_forwards (
    id, voucher_id, action, resend_of_forward_id, actor_type, client_request_id, delivery_mode,
    to_name_enc, to_name_masked, to_phone_enc, to_phone_hash, to_phone_last4, is_self_number, message_id, access_link_id)
  values (
    v_forward_id, p_voucher_id, p_action,
    case when p_action = 'resend' then v_current.id end,
    p_actor_type, p_client_request_id,
    case when p_action = 'direct_share' then 'direct_share' else 'seorap_message' end,
    case when p_action = 'resend' then v_current.to_name_enc when p_action = 'forward' then p_to_name_enc end,
    case when p_action = 'resend' then v_current.to_name_masked when p_action = 'forward' then p_to_name_masked end,
    case when p_action = 'resend' then v_current.to_phone_enc when p_action = 'forward' then p_to_phone_enc end,
    case when p_action = 'resend' then v_current.to_phone_hash when p_action = 'forward' then p_to_phone_hash end,
    case when p_action = 'resend' then v_current.to_phone_last4 when p_action = 'forward' then p_to_phone_last4 end,
    case when p_action = 'resend' then v_current.is_self_number else coalesce(p_is_self, false) end,
    v_msg_id, v_link_id);

  insert into app.access_links (id, token_hash, link_type, voucher_id, forward_id, expires_at, code_exposed_at)
  values (v_link_id, p_token_hash, 'forward', p_voucher_id, v_forward_id, now() + make_interval(days => p_link_ttl_days), v_current_link.code_exposed_at);

  if v_msg_id is not null then
    insert into app.messages (id, purpose, template_code, template_version, requested_channel, to_kind, to_phone_hash, to_phone_last4, forward_id)
    select v_msg_id, 't2_forward', 't2_forward', 1, 'alimtalk', 'forward_receiver', f.to_phone_hash, f.to_phone_last4, v_forward_id
      from app.voucher_forwards f where f.id = v_forward_id;
  end if;

  update app.vouchers set current_forward_id = v_forward_id, updated_at = now() where id = p_voucher_id;
  return query select v_forward_id, v_msg_id, v_link_id, true;
end $$;

revoke all on function app.otp_register_failure(uuid, int) from public, anon, authenticated;
revoke all on function app.otp_consume(uuid) from public, anon, authenticated;
revoke all on function app.voucher_mark_exposed(uuid, boolean, text) from public, anon, authenticated;
revoke all on function app.forward_counts(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function app.forward_apply(text, uuid, text, text, text, int, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function app.otp_register_failure(uuid, int) to service_role;
grant execute on function app.otp_consume(uuid) to service_role;
grant execute on function app.voucher_mark_exposed(uuid, boolean, text) to service_role;
grant execute on function app.forward_counts(uuid, uuid, text, timestamptz) to service_role;
grant execute on function app.forward_apply(text, uuid, text, text, text, int, text, text, text, text, text, boolean) to service_role;
