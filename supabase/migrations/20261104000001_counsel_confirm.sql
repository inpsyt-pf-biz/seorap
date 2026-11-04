-- 검사가 열리는 시점: 신청서 제출 직후 → 상담 예약 확정 뒤 (11-04, 시나리오 §5-1)
-- 제출은 기록만 남기고, 서랍을 열 때 상담 어드민에서 예약 확정·상담 완료를 확인하면 그때 잠금을 푼다.
-- 한 번 풀린 잠금은 예약이 취소돼도 다시 걸지 않는다(E4). 그래서 푼 시각을 제출 기록에 남긴다.

alter table app.counsel_submissions add column unlocked_at timestamptz;
-- 이 규칙 전에 낸 건은 제출하면서 이미 열렸다
update app.counsel_submissions set unlocked_at = submitted_at where unlocked_at is null;

-- 원장 전달이 성공한 뒤에만 부른다: 제출 기록만 남긴다(잠금은 그대로). 같은 주문으로 다시 오면 false
create or replace function app.counsel_record_submission(
  p_order_id uuid, p_order_item_id uuid, p_template_id uuid, p_template_version int, p_purchase_id uuid, p_client_request_id uuid
) returns boolean
language plpgsql set search_path = app, public as $$
begin
  insert into app.counsel_submissions (order_id, order_item_id, template_id, template_version, counsel_purchase_id, client_request_id)
  values (p_order_id, p_order_item_id, p_template_id, p_template_version, p_purchase_id, p_client_request_id)
  on conflict (order_id) do nothing;
  return found;
end;
$$;

-- 상담 어드민에서 예약 확정(또는 상담 완료)을 확인한 주문의 검사 잠금을 푼다. 이미 풀었으면 false
create function app.counsel_unlock(p_order_id uuid) returns boolean
language plpgsql set search_path = app, public as $$
begin
  update app.counsel_submissions set unlocked_at = now() where order_id = p_order_id and unlocked_at is null;
  if not found then
    return false;
  end if;
  update app.vouchers set lock_reasons = array_remove(lock_reasons, 'counsel_pending'), updated_at = now()
   where order_id = p_order_id and 'counsel_pending' = any (lock_reasons);
  return true;
end;
$$;

revoke all on function app.counsel_unlock(uuid) from public, anon, authenticated;
grant execute on function app.counsel_unlock(uuid) to service_role;
