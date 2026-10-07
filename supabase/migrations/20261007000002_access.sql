-- 링크·인증·전달·메시지 (Plan A)

create table app.access_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token_hash text not null unique,
  link_type text not null check (link_type in ('box', 'forward')),
  recipient_id uuid references app.recipients (id),
  voucher_id uuid references app.vouchers (id),
  forward_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('reforwarded', 'resent', 'forward_cancelled', 'voucher_cancelled', 'phone_changed', 'reported', 'admin', 'purged')),
  revoked_by text,
  first_opened_at timestamptz,
  code_exposed_at timestamptz,
  first_launched_at timestamptz,
  last_launched_at timestamptz,
  check ((link_type = 'box' and recipient_id is not null and voucher_id is null)
      or (link_type = 'forward' and voucher_id is not null and forward_id is not null)),
  check (link_type <> 'forward' or expires_at is not null)
);
-- 서랍당 살아 있는 링크 1개(A2), 1매당 받는 분 링크 1개
create unique index access_links_one_box on app.access_links (recipient_id) where link_type = 'box' and revoked_at is null;
create unique index access_links_one_forward on app.access_links (voucher_id) where link_type = 'forward' and revoked_at is null;

create table app.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  access_link_id uuid not null references app.access_links (id),
  target_phone_hash text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  locked_until timestamptz,
  consumed_at timestamptz,
  unlocked_by_admin boolean not null default false,
  message_id uuid,
  ip_hash text
);
create index otp_phone_idx on app.otp_challenges (target_phone_hash, created_at);
create index otp_link_idx on app.otp_challenges (access_link_id, created_at);

create table app.customer_sessions (
  id_hash text primary key,
  created_at timestamptz not null default now(),
  scope text not null check (scope in ('box', 'forward')),
  recipient_id uuid references app.recipients (id),
  access_link_id uuid not null references app.access_links (id),
  device_class text not null check (device_class in ('mobile', 'desktop')),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  last_otp_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);

create table app.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vendor_message_key text,
  purpose text not null check (purpose in ('t1_box', 't2_forward', 't3_counsel', 'otp', 'reminder', 'phone_change_notice', 'cancel_notice', 'ops_alert')),
  template_code text,
  template_version int,
  requested_channel text not null check (requested_channel in ('alimtalk', 'sms')),
  to_kind text not null check (to_kind in ('recipient', 'forward_receiver', 'counsel_applicant', 'operator')),
  to_phone_hash text,
  to_phone_last4 text,
  recipient_id uuid references app.recipients (id),
  forward_id uuid,
  otp_id uuid,
  accept_code text,
  accepted_at timestamptz,
  final_status text not null default 'queued' check (final_status in ('queued', 'accepted', 'delivered', 'failed', 'unknown')),
  final_media text check (final_media in ('alimtalk', 'sms', 'lms')),
  fallback_used boolean not null default false,
  final_at timestamptz,
  poll_due_at timestamptz,
  attempt_count int not null default 0,
  purged_at timestamptz
);

create table app.voucher_forwards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  voucher_id uuid not null references app.vouchers (id),
  action text not null check (action in ('forward', 'resend', 'cancel', 'direct_share')),
  resend_of_forward_id uuid references app.voucher_forwards (id),
  actor_type text not null check (actor_type in ('recipient', 'admin')),
  actor_admin_id uuid,
  client_request_id text not null unique,
  delivery_mode text not null check (delivery_mode in ('seorap_message', 'direct_share')),
  to_name_enc text,
  to_name_masked text,
  to_phone_enc text,
  to_phone_hash text,
  to_phone_last4 text,
  is_self_number boolean not null default false,
  message_id uuid,
  access_link_id uuid,
  purged_at timestamptz,
  check (action not in ('direct_share', 'cancel') or to_phone_enc is null),
  check (action not in ('forward', 'resend') or to_phone_enc is not null or purged_at is not null)
);
create index voucher_forwards_voucher_idx on app.voucher_forwards (voucher_id, created_at);
create index voucher_forwards_phone_idx on app.voucher_forwards (to_phone_hash) where purged_at is null;

-- 서로 가리키는 외래키는 트랜잭션 끝에 검사한다 (전달 1건 = 이력·링크·메시지를 한 번에 만든다)
alter table app.access_links add constraint access_links_forward_fk foreign key (forward_id) references app.voucher_forwards (id) deferrable initially deferred;
alter table app.voucher_forwards add constraint voucher_forwards_message_fk foreign key (message_id) references app.messages (id) deferrable initially deferred;
alter table app.voucher_forwards add constraint voucher_forwards_link_fk foreign key (access_link_id) references app.access_links (id) deferrable initially deferred;
alter table app.messages add constraint messages_forward_fk foreign key (forward_id) references app.voucher_forwards (id) deferrable initially deferred;
alter table app.messages add constraint messages_otp_fk foreign key (otp_id) references app.otp_challenges (id) deferrable initially deferred;
alter table app.otp_challenges add constraint otp_message_fk foreign key (message_id) references app.messages (id) deferrable initially deferred;
alter table app.vouchers add constraint vouchers_current_forward_fk foreign key (current_forward_id) references app.voucher_forwards (id) deferrable initially deferred;

create table app.message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references app.messages (id),
  source text not null check (source in ('webhook', 'poll', 'mock')),
  event_type text not null,
  media text,
  result_code text,
  vendor_ids jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create table app.events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  name text not null,
  recipient_id uuid,
  order_id uuid,
  voucher_id uuid,
  session_id_hash text,
  props jsonb not null default '{}'::jsonb,
  ip_hash text,
  ua_class text
);

-- 로컬·미리보기 전용 가짜 발신함. 운영에서는 코드가 쓰지도 읽지도 않는다.
create table app.dev_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('sms', 'alimtalk')),
  to_phone_last4 text not null,
  body text not null
);

-- 추가만 테이블: 수정·삭제·TRUNCATE 차단. 파기 함수만 seorap.purging=on 으로 수정 가능 (Plan C 이후)
create function app.block_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('seorap.purging', true), '') = 'on' then
    return new;
  end if;
  raise exception '% is append-only (%)', tg_table_name, tg_op;
end $$;

create trigger voucher_forwards_append_only before update or delete on app.voucher_forwards for each row execute function app.block_mutation();
create trigger voucher_forwards_no_truncate before truncate on app.voucher_forwards for each statement execute function app.block_mutation();
create trigger message_events_append_only before update or delete on app.message_events for each row execute function app.block_mutation();
create trigger message_events_no_truncate before truncate on app.message_events for each statement execute function app.block_mutation();
create trigger events_append_only before update or delete on app.events for each row execute function app.block_mutation();
create trigger events_no_truncate before truncate on app.events for each statement execute function app.block_mutation();

create view app.v_forward_log with (security_invoker = on) as
select f.id, f.voucher_id, f.action, f.actor_type, f.delivery_mode, f.created_at,
       f.to_name_enc, f.to_name_masked, f.to_phone_enc, f.to_phone_last4, f.purged_at,
       m.final_status, m.final_media, m.fallback_used, m.final_at,
       al.first_opened_at, al.first_launched_at, al.revoked_at, al.revoked_reason
  from app.voucher_forwards f
  left join app.messages m on m.id = f.message_id
  left join app.access_links al on al.id = f.access_link_id;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'app' loop
    execute format('alter table app.%I enable row level security', r.tablename);
  end loop;
end $$;
