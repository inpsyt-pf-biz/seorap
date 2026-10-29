-- 받는 분 1매 화면의 실시·코드 보기 (build-spec §4-7, B1)
-- 잠금 순서는 forward_apply 와 같게 발송권 → 링크. 그래서 구매자의 전달 취소와 받는 분의 실시가 겹쳐도 한쪽만 이긴다:
-- 실시가 먼저면 code_exposed_at 이 남아 취소가 CODE_EXPOSED 로 거절되고, 취소가 먼저면 여기서 revoked 를 본다.
-- 받는 분의 실시는 링크에만 남긴다. 발송권의 first_launched_at 은 서랍 주인이 실시한 기록이라 건드리지 않는다
-- (건드리면 구매자 줄이 "실시함 · 결과 보기"가 되어 남이 쓰는 코드로 들어갈 수 있다).

create function app.forward_link_status(p_link app.access_links, p_voucher app.vouchers)
returns text
language sql immutable as $$
  select case
    when p_link.revoked_at is not null then coalesce(p_link.revoked_reason, 'admin')
    when p_link.expires_at <= now() then 'expired'
    when p_voucher.cancel_status = 'cancelled' then 'voucher_cancelled'
    when p_voucher.issue_status <> 'issued' or p_voucher.cancel_status = 'checking' or p_voucher.platform_deleted_at is not null
      or cardinality(p_voucher.lock_reasons) > 0 or p_voucher.current_forward_id is distinct from p_link.forward_id then 'unavailable'
    else 'ok'
  end;
$$;

create function app.forward_link_use(p_token_hash text, p_launch boolean)
returns table (out_status text, out_voucher_id uuid)
language plpgsql set search_path = app, public as $$
declare
  v_link app.access_links;
  v_voucher app.vouchers;
  v_status text;
begin
  select * into v_link from app.access_links where token_hash = p_token_hash and link_type = 'forward';
  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  select * into v_voucher from app.vouchers where id = v_link.voucher_id for update;
  select * into v_link from app.access_links where id = v_link.id for update;
  v_status := app.forward_link_status(v_link, v_voucher);
  if v_status <> 'ok' then
    return query select v_status, v_voucher.id;
    return;
  end if;
  update app.access_links
     set first_opened_at = coalesce(first_opened_at, now()),
         code_exposed_at = coalesce(code_exposed_at, now()),
         first_launched_at = case when p_launch then coalesce(first_launched_at, now()) else first_launched_at end,
         last_launched_at = case when p_launch then now() else last_launched_at end
   where id = v_link.id;
  return query select 'ok'::text, v_voucher.id;
end;
$$;

-- 화면 정보 (기록 없음). 상태 판정은 forward_link_use 와 같은 함수를 쓴다
create function app.forward_link_peek(p_token_hash text)
returns table (out_status text, out_test_name text, out_sender_masked text, out_launched boolean)
language sql stable set search_path = app, public as $$
  select app.forward_link_status(l, v), v.test_name, r.name_masked, l.first_launched_at is not null
    from app.access_links l
    join app.vouchers v on v.id = l.voucher_id
    join app.orders o on o.id = v.order_id
    join app.recipients r on r.id = o.recipient_id
   where l.token_hash = p_token_hash and l.link_type = 'forward';
$$;

revoke all on function app.forward_link_peek(text) from public, anon, authenticated;
grant execute on function app.forward_link_peek(text) to service_role;
revoke all on function app.forward_link_status(app.access_links, app.vouchers) from public, anon, authenticated;
revoke all on function app.forward_link_use(text, boolean) from public, anon, authenticated;
grant execute on function app.forward_link_status(app.access_links, app.vouchers) to service_role;
grant execute on function app.forward_link_use(text, boolean) to service_role;
