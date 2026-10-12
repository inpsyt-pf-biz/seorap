-- MVP-1(기획 문서 Step 3): 구매 건·신청서·상담 장부·변경 이력.
-- 구매 건 1 : 상담 N. 지금은 상담 1회로 운영한다. 배정·상태는 상담 줄에 있고, 바뀔 때마다 이력이 한 줄씩 쌓인다.
-- 민감정보(복용 약물·진단명, 결과지 링크)와 유입 경로는 따로 둬서 나중에 센터에 보이는 범위를 좁힐 수 있게 한다.

insert into counsel.role_caps (member_role, cap) values
  ('hq_admin', 'purchase.manage'), ('hq_admin', 'session.assign'),
  ('hq_manager', 'purchase.manage'), ('hq_manager', 'session.assign');

create table counsel.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_type text not null check (purchase_type in ('test_main', 'counsel_main', 'sponsored', 'group_buy')),
  order_no text check (char_length(order_no) <= 40),
  product_name text check (char_length(product_name) <= 200),
  test_option text check (char_length(test_option) <= 200),
  counsel_option text check (char_length(counsel_option) <= 200),
  paid_on date,
  purchase_memo text check (char_length(purchase_memo) <= 1000),
  admin_memo text check (char_length(admin_memo) <= 2000),
  source text not null check (source in ('manual', 'sheet_import')),
  -- 시트 가져오기의 중복 판정 키(구분 + 응답 시각·연락처의 해시). 같은 줄을 두 번 가져와도 한 건만 남는다.
  source_ref text unique,
  version integer not null default 1,
  created_at timestamptz not null default counsel_private._now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default counsel_private._now(),
  updated_by uuid references auth.users (id)
);
create unique index purchases_order_no_unique on counsel.purchases (order_no) where order_no is not null;
create trigger purchases_touch before update on counsel.purchases for each row execute function counsel_private.touch_version();

-- 신청서. 구매 건마다 0~1개(신청서를 아직 안 낸 구매 건도 있다).
create table counsel.applications (
  purchase_id uuid primary key references counsel.purchases (id),
  submitted_at timestamptz,
  client_name text check (char_length(client_name) <= 50),
  client_phone text check (char_length(client_phone) <= 30),
  client_birth text check (char_length(client_birth) <= 30),
  residence text check (char_length(residence) <= 100),
  school text check (char_length(school) <= 100),
  guardian_name text check (char_length(guardian_name) <= 50),
  guardian_phone text check (char_length(guardian_phone) <= 30),
  test_name text check (char_length(test_name) <= 100),
  counsel_field text check (char_length(counsel_field) <= 200),
  reason text check (char_length(reason) <= 2000),
  preferred_schedule text check (char_length(preferred_schedule) <= 500),
  preferred_method text check (char_length(preferred_method) <= 50),
  counseling_experience text check (char_length(counseling_experience) <= 500),
  expectation text check (char_length(expectation) <= 2000),
  request_note text check (char_length(request_note) <= 2000),
  consent_third_party boolean not null default false,
  refund_policy_checked boolean not null default false,
  created_at timestamptz not null default counsel_private._now()
);

-- 민감정보(건강 정보)와 결과지 링크
create table counsel.application_sensitive (
  purchase_id uuid primary key references counsel.purchases (id),
  medication_diagnosis text check (char_length(medication_diagnosis) <= 1000),
  result_file_url text check (char_length(result_file_url) <= 1000),
  created_at timestamptz not null default counsel_private._now()
);

-- 마케팅 정보. 인싸이트만 본다.
create table counsel.application_marketing (
  purchase_id uuid primary key references counsel.purchases (id),
  referral_source text check (char_length(referral_source) <= 500),
  created_at timestamptz not null default counsel_private._now()
);

-- 상담 장부: 상담 1회 = 1줄
create table counsel.sessions (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references counsel.purchases (id),
  seq integer not null default 1 check (seq >= 1),
  status text not null default 'unassigned'
    check (status in ('unassigned', 'requested', 'confirmed', 'completed', 'unable', 'cancelled')),
  center_id uuid references counsel.centers (id),
  assigned_at timestamptz,
  assigned_by uuid references auth.users (id),
  scheduled_at timestamptz,
  method text check (method in ('offline', 'online')),
  cost integer check (cost >= 0),
  version integer not null default 1,
  created_at timestamptz not null default counsel_private._now(),
  updated_at timestamptz not null default counsel_private._now(),
  updated_by uuid references auth.users (id),
  unique (purchase_id, seq),
  -- 미배정이면 센터가 없고, 예약 요청부터는 센터가 있다(취소는 둘 다 가능)
  constraint sessions_center_by_status check (
    (status = 'unassigned' and center_id is null)
    or (status in ('requested', 'confirmed', 'completed', 'unable') and center_id is not null)
    or status = 'cancelled'
  )
);
create index sessions_center on counsel.sessions (center_id);
create index sessions_status on counsel.sessions (status);
create trigger sessions_touch before update on counsel.sessions for each row execute function counsel_private.touch_version();

-- 변경 이력. 추가만 된다.
create table counsel.session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references counsel.sessions (id),
  at timestamptz not null default counsel_private._now(),
  actor uuid references auth.users (id),
  kind text not null check (kind in ('created', 'imported', 'assigned', 'reassigned', 'status_changed')),
  from_status text,
  to_status text,
  from_center uuid,
  to_center uuid,
  note text check (char_length(note) <= 500)
);
create index session_events_session on counsel.session_events (session_id, at);

create function counsel_private.append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'COUNSEL:APPEND_ONLY';
end
$$;
create trigger session_events_append_only before update or delete on counsel.session_events
  for each row execute function counsel_private.append_only();

-- 센터별 상담 완료/배정 건수(취소 건은 배정에서 뺀다). 부른 사람의 권한으로 읽는다.
create view counsel.center_stats with (security_invoker = true) as
  select c.id as center_id,
    count(s.id) filter (where s.status <> 'cancelled')::int as assigned_count,
    count(s.id) filter (where s.status = 'completed')::int as completed_count
  from counsel.centers c
  left join counsel.sessions s on s.center_id = c.id
  group by c.id;

-- 행 단위 권한: 지금은 본사(인싸이트)만 읽는다. 센터 계정은 MVP-3에서 자기 센터 건만 열린다.
alter table counsel.purchases enable row level security;
alter table counsel.purchases force row level security;
alter table counsel.applications enable row level security;
alter table counsel.applications force row level security;
alter table counsel.application_sensitive enable row level security;
alter table counsel.application_sensitive force row level security;
alter table counsel.application_marketing enable row level security;
alter table counsel.application_marketing force row level security;
alter table counsel.sessions enable row level security;
alter table counsel.sessions force row level security;
alter table counsel.session_events enable row level security;
alter table counsel.session_events force row level security;

create policy purchases_read on counsel.purchases for select to authenticated using ((select counsel_private.is_hq()));
create policy applications_read on counsel.applications for select to authenticated using ((select counsel_private.is_hq()));
create policy application_sensitive_read on counsel.application_sensitive for select to authenticated using ((select counsel_private.is_hq()));
create policy application_marketing_read on counsel.application_marketing for select to authenticated using ((select counsel_private.is_hq()));
create policy sessions_read on counsel.sessions for select to authenticated using ((select counsel_private.is_hq()));
create policy session_events_read on counsel.session_events for select to authenticated using ((select counsel_private.is_hq()));

grant select on counsel.purchases, counsel.applications, counsel.application_sensitive, counsel.application_marketing,
  counsel.sessions, counsel.session_events, counsel.center_stats to authenticated;

-- 신청서 한 건을 jsonb 에서 꺼내 세 표에 넣는다(직접 등록·시트 가져오기 공용)
create function counsel_private._insert_application(p_purchase_id uuid, a jsonb) returns void
language plpgsql set search_path = ''
as $$
begin
  if a is null or a = 'null'::jsonb then
    return;
  end if;
  -- 문자열로 한 번 더 감싼 JSON 같은 값이 빈 신청서로 조용히 들어가지 않게 막는다
  if jsonb_typeof(a) <> 'object' then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'application must be an object';
  end if;
  insert into counsel.applications (
    purchase_id, submitted_at, client_name, client_phone, client_birth, residence, school, guardian_name, guardian_phone,
    test_name, counsel_field, reason, preferred_schedule, preferred_method, counseling_experience, expectation, request_note,
    consent_third_party, refund_policy_checked
  ) values (
    p_purchase_id, (a->>'submitted_at')::timestamptz,
    counsel_private._blank_to_null(a->>'client_name'), counsel_private._blank_to_null(a->>'client_phone'),
    counsel_private._blank_to_null(a->>'client_birth'), counsel_private._blank_to_null(a->>'residence'),
    counsel_private._blank_to_null(a->>'school'), counsel_private._blank_to_null(a->>'guardian_name'),
    counsel_private._blank_to_null(a->>'guardian_phone'), counsel_private._blank_to_null(a->>'test_name'),
    counsel_private._blank_to_null(a->>'counsel_field'), counsel_private._blank_to_null(a->>'reason'),
    counsel_private._blank_to_null(a->>'preferred_schedule'), counsel_private._blank_to_null(a->>'preferred_method'),
    counsel_private._blank_to_null(a->>'counseling_experience'), counsel_private._blank_to_null(a->>'expectation'),
    counsel_private._blank_to_null(a->>'request_note'),
    coalesce((a->>'consent_third_party')::boolean, false), coalesce((a->>'refund_policy_checked')::boolean, false)
  );
  if counsel_private._blank_to_null(a->>'medication_diagnosis') is not null or counsel_private._blank_to_null(a->>'result_file_url') is not null then
    insert into counsel.application_sensitive (purchase_id, medication_diagnosis, result_file_url)
    values (p_purchase_id, counsel_private._blank_to_null(a->>'medication_diagnosis'), counsel_private._blank_to_null(a->>'result_file_url'));
  end if;
  if counsel_private._blank_to_null(a->>'referral_source') is not null then
    insert into counsel.application_marketing (purchase_id, referral_source)
    values (p_purchase_id, counsel_private._blank_to_null(a->>'referral_source'));
  end if;
end
$$;

-- 구매 건 직접 등록. 신청서(p_application)는 없어도 된다. 상담 1회(미배정)가 함께 생긴다.
create function counsel.rpc_create_purchase(
  p_purchase_type text,
  p_order_no text,
  p_product_name text,
  p_test_option text,
  p_counsel_option text,
  p_paid_on date,
  p_purchase_memo text,
  p_admin_memo text,
  p_application jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_session uuid;
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  begin
    insert into counsel.purchases (
      purchase_type, order_no, product_name, test_option, counsel_option, paid_on, purchase_memo, admin_memo, source, created_by, updated_by
    ) values (
      p_purchase_type, counsel_private._blank_to_null(p_order_no), counsel_private._blank_to_null(p_product_name),
      counsel_private._blank_to_null(p_test_option), counsel_private._blank_to_null(p_counsel_option), p_paid_on,
      counsel_private._blank_to_null(p_purchase_memo), counsel_private._blank_to_null(p_admin_memo), 'manual', auth.uid(), auth.uid()
    ) returning id into v_id;
    perform counsel_private._insert_application(v_id, p_application);
    insert into counsel.sessions (purchase_id, seq, updated_by) values (v_id, 1, auth.uid()) returning id into v_session;
    insert into counsel.session_events (session_id, actor, kind, to_status) values (v_session, auth.uid(), 'created', 'unassigned');
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:DUPLICATE_ORDER';
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_id;
end
$$;

-- 구글시트(폼 응답) 가져오기. 줄마다 구매 건 + 신청서 + 상담 1회(미배정)를 만든다.
-- 같은 줄(구분 + source_key)은 두 번 들어가지 않는다. 한 줄이라도 잘못되면 전체를 되돌린다.
create function counsel.rpc_import_applications(p_purchase_type text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  v_id uuid;
  v_session uuid;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_index integer := 0;
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'rows must be an array';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      insert into counsel.purchases (
        purchase_type, test_option, counsel_option, purchase_memo, admin_memo, source, source_ref, created_by, updated_by
      ) values (
        p_purchase_type, counsel_private._blank_to_null(r->>'test_option'), counsel_private._blank_to_null(r->>'counsel_option'),
        counsel_private._blank_to_null(r->>'purchase_memo'), counsel_private._blank_to_null(r->>'admin_memo'),
        'sheet_import', p_purchase_type || ':' || md5(coalesce(r->>'source_key', '')), auth.uid(), auth.uid()
      )
      on conflict (source_ref) do nothing
      returning id into v_id;
      if v_id is null then
        v_duplicates := v_duplicates + 1;
        continue;
      end if;
      perform counsel_private._insert_application(v_id, r->'application');
      insert into counsel.sessions (purchase_id, seq, updated_by) values (v_id, 1, auth.uid()) returning id into v_session;
      insert into counsel.session_events (session_id, actor, kind, to_status) values (v_session, auth.uid(), 'imported', 'unassigned');
      v_inserted := v_inserted + 1;
    exception
      when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'row ' || v_index || ': ' || sqlerrm;
    end;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates);
end
$$;

-- 여러 상담 줄을 한 센터에 배정(또는 다시 배정)한다. 미배정·예약 요청 상태만 바꾸고 나머지는 건너뛴다.
-- 배정할 수 있는 센터는 운영 중(active)인 협력센터뿐이다.
create function counsel.rpc_assign_sessions(p_session_ids uuid[], p_center_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
  v_assigned integer := 0;
  v_skipped integer := 0;
begin
  if not counsel_private.has_cap('session.assign') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  if not exists (select 1 from counsel.centers c where c.id = p_center_id and not c.is_headquarters and c.status = 'active') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:CENTER_NOT_ASSIGNABLE';
  end if;
  if char_length(p_note) > 500 then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'note too long';
  end if;
  for s in
    select x.id, x.status, x.center_id from counsel.sessions x where x.id = any (p_session_ids) order by x.id for update
  loop
    if s.status not in ('unassigned', 'requested') or s.center_id is not distinct from p_center_id then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    update counsel.sessions set
      status = 'requested', center_id = p_center_id, assigned_at = counsel_private._now(), assigned_by = auth.uid(), updated_by = auth.uid()
    where id = s.id;
    insert into counsel.session_events (session_id, actor, kind, from_status, to_status, from_center, to_center, note)
    values (s.id, auth.uid(), case when s.center_id is null then 'assigned' else 'reassigned' end,
      s.status, 'requested', s.center_id, p_center_id, counsel_private._blank_to_null(p_note));
    v_assigned := v_assigned + 1;
  end loop;
  v_skipped := v_skipped + (coalesce(array_length(p_session_ids, 1), 0) - v_assigned - v_skipped);
  return jsonb_build_object('assigned', v_assigned, 'skipped', v_skipped);
end
$$;

revoke execute on all functions in schema counsel from public;
revoke execute on all functions in schema counsel_private from public;
grant execute on function counsel_private.my_center_ids() to authenticated;
grant execute on function counsel_private.is_hq() to authenticated;
grant execute on function counsel_private.has_cap(text) to authenticated;
grant execute on function counsel_private.is_self(uuid) to authenticated;
grant execute on function counsel.my_context() to authenticated;
grant execute on function counsel.rpc_create_center(text, text, text, text, double precision, double precision, text[], text[], text[], text[], text, text, text, text, text, date, date, text) to authenticated;
grant execute on function counsel.rpc_update_center(uuid, integer, text, text, text, text, double precision, double precision, text[], text[], text[], text[], text, text, text, text, text, date, date, text) to authenticated;
grant execute on function counsel.rpc_create_purchase(text, text, text, text, text, date, text, text, jsonb) to authenticated;
grant execute on function counsel.rpc_import_applications(text, jsonb) to authenticated;
grant execute on function counsel.rpc_assign_sessions(uuid[], uuid, text) to authenticated;
