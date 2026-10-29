-- 상담 신청서 (B2). 신청서 문항은 상담 어드민의 템플릿에서 가져오고, 답은 서랍에 저장하지 않고 상담 원장으로 넘긴다.
-- 서랍에는 "언제, 어떤 템플릿의 몇 판으로 냈는지"와 원장 쪽 구매 건 ID 만 남긴다.

-- 스토어 관리코드(옵션 관리코드, 없으면 판매자관리코드). 상담 어드민의 상품 연결이 이 값으로 템플릿을 고른다
alter table app.order_items add column manage_code text check (manage_code ~ '^[A-Za-z0-9_-]{1,20}$');

create table app.counsel_submissions (
  order_id uuid primary key references app.orders (id),
  order_item_id uuid not null references app.order_items (id),
  template_id uuid not null,
  template_version int not null check (template_version >= 1),
  counsel_purchase_id uuid not null,
  client_request_id uuid not null unique,
  submitted_at timestamptz not null default now()
);
alter table app.counsel_submissions enable row level security;

-- 원장 전달이 성공한 뒤에만 부른다: 제출 기록을 남기고 그 주문의 상담 잠금을 한 번에 푼다.
-- 같은 주문으로 다시 오면 아무것도 바꾸지 않고 false
create function app.counsel_record_submission(
  p_order_id uuid, p_order_item_id uuid, p_template_id uuid, p_template_version int, p_purchase_id uuid, p_client_request_id uuid
) returns boolean
language plpgsql set search_path = app, public as $$
begin
  insert into app.counsel_submissions (order_id, order_item_id, template_id, template_version, counsel_purchase_id, client_request_id)
  values (p_order_id, p_order_item_id, p_template_id, p_template_version, p_purchase_id, p_client_request_id)
  on conflict (order_id) do nothing;
  if not found then
    return false;
  end if;
  update app.vouchers set lock_reasons = array_remove(lock_reasons, 'counsel_pending'), updated_at = now()
   where order_id = p_order_id and 'counsel_pending' = any (lock_reasons);
  return true;
end;
$$;

revoke all on function app.counsel_record_submission(uuid, uuid, uuid, int, uuid, uuid) from public, anon, authenticated;
grant execute on function app.counsel_record_submission(uuid, uuid, uuid, int, uuid, uuid) to service_role;
