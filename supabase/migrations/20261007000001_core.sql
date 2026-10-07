-- 서랍 핵심 테이블 (Plan A). 정본: launch-plan §5. 달라진 점은 계획 문서 끝에 정리.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to service_role;
alter default privileges in schema app grant select, insert, update, delete on tables to service_role;
alter default privileges in schema app grant execute on functions to service_role;

create table app.settings (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table app.recipients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone_enc text not null,
  phone_hash text not null unique,
  phone_last4 text not null,
  name_enc text,
  name_masked text,
  enc_key_version smallint not null default 1,
  first_order_at timestamptz not null,
  last_order_at timestamptz not null,
  last_login_at timestamptz,
  status text not null default 'active' check (status in ('active', 'blocked', 'purged')),
  blocked_reason text,
  purged_at timestamptz,
  updated_at timestamptz not null default now()
);
create index recipients_last_order_idx on app.recipients (last_order_at) where status <> 'purged';

create table app.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('naver_api', 'excel', 'own_pg', 'manual')),
  external_order_id text not null,
  recipient_id uuid not null references app.recipients (id),
  paid_at timestamptz not null,
  ordered_at timestamptz,
  recipient_name_enc text,
  recipient_name_masked text,
  orderer_name_enc text,
  orderer_name_masked text,
  orderer_differs boolean not null default false,
  has_delivery_memo boolean not null default false,
  is_test boolean not null default false,
  link_sent_at timestamptz,
  purged_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (source, external_order_id)
);
create index orders_recipient_paid_idx on app.orders (recipient_id, paid_at desc);

create table app.store_products (
  naver_product_id text primary key,
  kind text not null default 'unknown' check (kind in ('test', 'tool', 'other', 'unknown')),
  product_name text,
  first_seen_at timestamptz not null default now(),
  alerted_at timestamptz,
  updated_by text
);

create table app.product_mappings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key_type text not null check (key_type in ('seller_code', 'product_option')),
  seller_product_code text,
  naver_product_id text,
  original_product_id text,
  option_code text,
  version int not null default 1,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  includes_counsel boolean not null default false,
  is_supplement boolean not null default false,
  enabled boolean not null default true,
  is_test_product boolean not null default false,
  min_amount int,
  created_by text
);

create table app.product_mapping_items (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references app.product_mappings (id),
  psy_item_id text not null,
  sub_component_id text,
  test_name text not null,
  count_per_unit int not null check (count_per_unit > 0),
  respondent text not null default 'self' check (respondent in ('self', 'guardian'))
);

create table app.order_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references app.orders (id),
  naver_product_order_id text not null unique,
  naver_product_id text,
  original_product_id text,
  option_code text,
  seller_product_code text,
  product_name text not null,
  option_name text,
  quantity int not null,
  remain_quantity int,
  payment_amount int not null,
  product_order_status text,
  place_order_status text,
  last_changed_type text,
  last_changed_at timestamptz,
  gift_receiving_status text,
  placed_confirmed_at timestamptz,
  shipping_due_at timestamptz,
  dispatched_at timestamptz,
  dispatch_status text not null default 'none' check (dispatch_status in ('none', 'pending', 'done', 'failed', 'external')),
  dispatch_error_code text,
  mapping_id uuid references app.product_mappings (id),
  handling text not null default 'seorap' check (handling in ('seorap', 'not_target', 'legacy_sent', 'shadow_only', 'test', 'manual_only')),
  process_status text not null default 'awaiting_payment' check (process_status in (
    'awaiting_payment', 'awaiting_gift', 'mapping_pending', 'held_contact', 'held_amount', 'boundary_check',
    'confirming', 'confirm_failed', 'issuing', 'issue_failed', 'issue_unknown', 'partially_issued',
    'link_queued', 'link_sent', 'dispatched', 'manual_required', 'closed_cancelled')),
  hold_reason text,
  last_trace_id text,
  updated_at timestamptz not null default now()
);
create index order_items_order_idx on app.order_items (order_id);

create table app.code_issuances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_item_id uuid not null references app.order_items (id),
  idempotency_key text not null unique,
  reason text not null default 'order' check (reason in ('order', 'reissue', 'manual_entry')),
  status text not null default 'pending' check (status in ('pending', 'in_flight', 'succeeded', 'partial', 'failed', 'unknown')),
  expected_count int not null,
  issued_count int not null default 0,
  attempt_count int not null default 0,
  request_meta jsonb not null default '{}'::jsonb check (not (request_meta ?| array['name', 'phone', 'tel', 'recipient'])),
  response_code text,
  error_code text,
  requested_at timestamptz,
  completed_at timestamptz,
  requested_by text
);

create table app.vouchers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_item_id uuid not null references app.order_items (id),
  order_id uuid not null references app.orders (id),
  issuance_id uuid references app.code_issuances (id),
  issued_via text not null default 'api' check (issued_via in ('api', 'manual')),
  entered_by text,
  test_item_id text not null,
  sub_component_id text,
  test_name text not null,
  unit_no int not null check (unit_no > 0),
  code_enc text,
  code_hash text unique,
  code_valid_until timestamptz,
  issue_status text not null default 'pending' check (issue_status in ('pending', 'issued', 'failed', 'voided', 'replaced')),
  amount int,
  reissued_from_id uuid references app.vouchers (id),
  replaced_by_id uuid references app.vouchers (id),
  first_code_exposed_at timestamptz,
  first_launched_at timestamptz,
  last_launched_at timestamptz,
  launched_by text check (launched_by in ('recipient', 'forward_receiver')),
  exam_status text check (exam_status in ('unused', 'in_progress', 'completed', 'deleted')),
  exam_progress numeric,
  exam_completed_at timestamptz,
  exam_checked_at timestamptz,
  platform_deleted_at timestamptz,
  cancel_status text not null default 'none' check (cancel_status in ('none', 'checking', 'cancelled', 'rejected')),
  lock_reasons text[] not null default '{}' check (lock_reasons <@ array['counsel_pending', 'reported_not_mine', 'phone_change_pending', 'admin_hold']),
  current_forward_id uuid,
  alias text,
  updated_at timestamptz not null default now(),
  unique (order_item_id, test_item_id, unit_no)
);
create index vouchers_order_idx on app.vouchers (order_id);

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'app' loop
    execute format('alter table app.%I enable row level security', r.tablename);
  end loop;
end $$;
