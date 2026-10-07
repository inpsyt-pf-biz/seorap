-- 전달 자격·한도를 잠금 아래에서 다시 검사하고, 전달된 발송권의 실시 기록을 막는다 (Plan A, Task 14 보강)
--  1) 한 발송권은 두 사람에게 가지 않는다: 전달 시 발송권 행을 잠그고 자격(발급됨·취소 없음·미실시·삭제 없음·잠금 없음)을 다시 본다.
--     반대로 실시·코드 보기는 전달 중인 발송권이면 아무것도 바꾸지 않고 false 를 돌려준다.
--  2) 한도는 병렬 요청으로 우회되지 않는다: 받는 분(수취인) 행 → 발송권 행 순서로 잠근 뒤, 같은 정의로 다시 센다.

drop function app.forward_apply(text, uuid, text, text, text, int, text, text, text, text, text, boolean);
drop function app.voucher_mark_exposed(uuid, boolean, text);

create function app.voucher_mark_exposed(p_voucher_id uuid, p_launch boolean, p_launched_by text default 'recipient')
returns boolean
language sql set search_path = app, public as $$
  with u as (
    update app.vouchers
       set first_code_exposed_at = coalesce(first_code_exposed_at, now()),
           first_launched_at = case when p_launch then coalesce(first_launched_at, now()) else first_launched_at end,
           last_launched_at = case when p_launch then now() else last_launched_at end,
           launched_by = case when p_launch then coalesce(launched_by, p_launched_by) else launched_by end,
           updated_at = now()
     where id = p_voucher_id
       and (p_launched_by <> 'recipient' or current_forward_id is null)
    returning 1
  )
  select exists (select 1 from u);
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
  p_is_self boolean default false,
  p_day_start timestamptz default null,
  p_per_voucher_day int default null,
  p_per_box_day int default null,
  p_same_number_gap_min int default null
)
returns table (out_forward_id uuid, out_message_id uuid, out_access_link_id uuid, out_created boolean)
language plpgsql set search_path = app, public as $$
declare
  v_existing app.voucher_forwards%rowtype;
  v_voucher app.vouchers%rowtype;
  v_recipient_id uuid;
  v_current app.voucher_forwards%rowtype;
  v_current_link app.access_links%rowtype;
  v_forward_id uuid := gen_random_uuid();
  v_msg_id uuid := null;
  v_link_id uuid := null;
  v_voucher_today int;
  v_box_today int;
  v_unused int;
  v_last_same timestamptz;
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

  -- 잠금 순서는 항상 수취인 → 발송권 (교착 방지). 같은 서랍의 전달·다시 보내기는 여기서 한 줄로 선다.
  -- 수취인 잠금은 no key update: 이 함수끼리는 서로 기다리지만, 수취인을 참조하는 외래 키 삽입(주문·세션·OTP)은 막지 않는다.
  select o.recipient_id into v_recipient_id
    from app.vouchers v join app.orders o on o.id = v.order_id where v.id = p_voucher_id;
  if v_recipient_id is null then
    raise exception 'NOT_FORWARDABLE';
  end if;
  perform 1 from app.recipients where id = v_recipient_id for no key update;
  select * into v_voucher from app.vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'NOT_FORWARDABLE';
  end if;
  select f.* into v_current from app.voucher_forwards f where f.id = v_voucher.current_forward_id;

  if p_action in ('forward', 'direct_share') and v_current.id is not null then
    raise exception 'ALREADY_FORWARDED';
  end if;
  -- 새로 보내는 전달은 잠금 아래에서 자격을 다시 본다 (그사이 실시·취소·잠금이 생겼을 수 있다)
  -- 취소 신청이 거절된 발송권은 그대로 쓸 수 있다 (lineStatus 도 전달하기를 내어 준다)
  if p_action in ('forward', 'direct_share') and not (
    v_voucher.issue_status = 'issued'
    and v_voucher.cancel_status in ('none', 'rejected')
    and v_voucher.first_launched_at is null
    and v_voucher.platform_deleted_at is null
    and cardinality(v_voucher.lock_reasons) = 0
  ) then
    raise exception 'NOT_FORWARDABLE';
  end if;
  if p_action in ('resend', 'cancel') and v_current.id is null then
    raise exception 'NO_ACTIVE_FORWARD';
  end if;
  if p_action = 'resend' and v_current.delivery_mode = 'direct_share' then
    raise exception 'NOT_RESENDABLE';
  end if;

  -- 한도는 잠금 아래에서 forward_counts 와 같은 정의로 다시 센다 (병렬 요청으로 넘기지 못하게)
  if p_action in ('forward', 'resend') then
    if p_day_start is not null and p_per_voucher_day is not null then
      select count(*)::int into v_voucher_today from app.voucher_forwards f
       where f.voucher_id = p_voucher_id and f.action in ('forward', 'resend') and f.created_at >= p_day_start;
      if v_voucher_today >= p_per_voucher_day then
        raise exception 'LIMIT_EXCEEDED';
      end if;
    end if;
    if p_day_start is not null and p_per_box_day is not null then
      select count(*)::int into v_box_today from app.voucher_forwards f
       where f.voucher_id in (select v.id from app.vouchers v join app.orders o on o.id = v.order_id where o.recipient_id = v_recipient_id)
         and f.action in ('forward', 'resend') and f.created_at >= p_day_start;
      -- 하루 한도는 아직 쓰지 않은 줄 수보다 낮아지지 않는다 (checkForwardLimits 와 같은 규칙)
      select count(*)::int into v_unused from app.vouchers v join app.orders o on o.id = v.order_id
       where o.recipient_id = v_recipient_id and v.issue_status = 'issued' and v.cancel_status = 'none'
         and v.first_launched_at is null and v.current_forward_id is null and cardinality(v.lock_reasons) = 0;
      if v_box_today >= greatest(p_per_box_day, v_unused) then
        raise exception 'LIMIT_EXCEEDED';
      end if;
    end if;
    if p_same_number_gap_min is not null and p_to_phone_hash is not null then
      select max(f.created_at) into v_last_same from app.voucher_forwards f
       where f.voucher_id in (select v.id from app.vouchers v join app.orders o on o.id = v.order_id where o.recipient_id = v_recipient_id)
         and f.to_phone_hash = p_to_phone_hash and f.action in ('forward', 'resend');
      if v_last_same is not null and v_last_same > now() - make_interval(mins => p_same_number_gap_min) then
        raise exception 'LIMIT_EXCEEDED';
      end if;
    end if;
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

revoke all on function app.voucher_mark_exposed(uuid, boolean, text) from public, anon, authenticated;
revoke all on function app.forward_apply(text, uuid, text, text, text, int, text, text, text, text, text, boolean, timestamptz, int, int, int) from public, anon, authenticated;
grant execute on function app.voucher_mark_exposed(uuid, boolean, text) to service_role;
grant execute on function app.forward_apply(text, uuid, text, text, text, int, text, text, text, text, text, boolean, timestamptz, int, int, int) to service_role;
