-- MVP-2: 상담 진행 바꾸기(예약 확정·변경·완료·불가·취소), 건 메모, 신청서 대기함(시트 가져오기 → 네이버 주문에 붙이기), 센터 상담사 목록.
-- 쓰기는 지금까지처럼 counsel.rpc_* 함수로만 한다.

-- 상담 진행 바꾸기와 메모는 본사 두 역할이 한다(센터 공용 계정은 MVP-3에서 더한다)
insert into counsel.role_caps (member_role, cap) values
  ('hq_admin', 'session.manage'), ('hq_manager', 'session.manage'),
  ('hq_admin', 'note.write'), ('hq_manager', 'note.write');

-- 1) 상담 기록에 예약 일시 변경을 남긴다
alter table counsel.session_events drop constraint session_events_kind_check;
alter table counsel.session_events add constraint session_events_kind_check
  check (kind in ('created', 'imported', 'assigned', 'reassigned', 'status_changed', 'rescheduled'));
alter table counsel.session_events add column from_scheduled_at timestamptz;
alter table counsel.session_events add column to_scheduled_at timestamptz;

-- 2) 상담 불가가 된 건도 다른 센터로 다시 배정할 수 있다(못 맡은 센터 대신 인싸이트가 다시 배정)
create or replace function counsel.rpc_assign_sessions(p_session_ids uuid[], p_center_id uuid, p_note text) returns jsonb
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
    if s.status not in ('unassigned', 'requested', 'unable') or s.center_id is not distinct from p_center_id then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    update counsel.sessions set
      status = 'requested', center_id = p_center_id, scheduled_at = null,
      assigned_at = counsel_private._now(), assigned_by = auth.uid(), updated_by = auth.uid()
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

-- 3) 상담 진행 바꾸기. 할 수 있는 일은 상태마다 정해져 있다(core/sessions.ts 와 같다).
--   confirm    예약 요청 → 예약 확정 (예약 일시 필수)
--   reschedule 예약 확정 → 예약 확정 (새 예약 일시·사유 필수)
--   complete   예약 확정 → 상담 완료
--   unable     예약 요청·예약 확정 → 상담 불가 (사유 필수)
--   cancel     미배정·예약 요청·예약 확정·상담 불가 → 취소 (사유 필수)
create function counsel.rpc_update_session(
  p_session_id uuid,
  p_version integer,
  p_action text,
  p_scheduled_at timestamptz,
  p_method text,
  p_reason text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  s counsel.sessions%rowtype;
  v_reason text := counsel_private._blank_to_null(p_reason);
  v_to text;
  v_schedule boolean := p_action in ('confirm', 'reschedule');
  v_version integer;
begin
  if not counsel_private.has_cap('session.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  select * into s from counsel.sessions where id = p_session_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  if s.version <> p_version then
    raise exception using errcode = 'P0001', message = 'COUNSEL:VERSION_CONFLICT';
  end if;
  if char_length(v_reason) > 500 or (p_method is not null and p_method not in ('offline', 'online')) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'reason or method';
  end if;
  if p_action = 'confirm' and s.status = 'requested' then v_to := 'confirmed';
  elsif p_action = 'reschedule' and s.status = 'confirmed' then v_to := 'confirmed';
  elsif p_action = 'complete' and s.status = 'confirmed' then v_to := 'completed';
  elsif p_action = 'unable' and s.status in ('requested', 'confirmed') then v_to := 'unable';
  elsif p_action = 'cancel' and s.status in ('unassigned', 'requested', 'confirmed', 'unable') then v_to := 'cancelled';
  elsif p_action in ('confirm', 'reschedule', 'complete', 'unable', 'cancel') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_TRANSITION';
  else
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'action';
  end if;
  if (v_schedule and p_scheduled_at is null)
    or (p_action in ('reschedule', 'unable', 'cancel') and v_reason is null) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'scheduled_at or reason required';
  end if;

  update counsel.sessions set
    status = v_to,
    scheduled_at = case when v_schedule then p_scheduled_at else scheduled_at end,
    method = case when v_schedule then coalesce(p_method, method) else method end,
    updated_by = auth.uid()
  where id = s.id
  returning version into v_version;
  insert into counsel.session_events (
    session_id, actor, kind, from_status, to_status, from_center, to_center, from_scheduled_at, to_scheduled_at, note
  ) values (
    s.id, auth.uid(), case when p_action = 'reschedule' then 'rescheduled' else 'status_changed' end, s.status, v_to,
    s.center_id, s.center_id, s.scheduled_at, case when v_schedule then p_scheduled_at else s.scheduled_at end, v_reason
  );
  return v_version;
end
$$;

-- 4) 건 메모. 덧붙이기만 된다(고치거나 지우지 못한다).
create table counsel.purchase_notes (
  id bigint generated always as identity primary key,
  purchase_id uuid not null references counsel.purchases (id),
  body text not null check (char_length(body) between 1 and 1000),
  author uuid references auth.users (id),
  created_at timestamptz not null default counsel_private._now()
);
create index purchase_notes_purchase on counsel.purchase_notes (purchase_id, created_at);
create trigger purchase_notes_append_only before update or delete on counsel.purchase_notes
  for each row execute function counsel_private.append_only();

create function counsel.rpc_add_purchase_note(p_purchase_id uuid, p_body text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_body text := counsel_private._blank_to_null(p_body);
  v_id bigint;
begin
  if not counsel_private.has_cap('note.write') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  if v_body is null or char_length(v_body) > 1000 then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'body';
  end if;
  if not exists (select 1 from counsel.purchases where id = p_purchase_id) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  insert into counsel.purchase_notes (purchase_id, body, author) values (p_purchase_id, v_body, auth.uid()) returning id into v_id;
  return v_id;
end
$$;

-- 5) 신청서 대기함. 구글시트 줄 가운데 맞는 구매 건을 찾지 못한 줄이 여기서 기다린다.
-- 처리(붙이기·새 구매 건·버리기)하면 신청서 내용(payload)과 보이는 칸을 지우고, 같은 줄을 다시 가져오지 않도록 source_ref 만 남긴다.
create table counsel.application_inbox (
  id uuid primary key default gen_random_uuid(),
  purchase_type text not null check (purchase_type in ('test_main', 'counsel_main', 'sponsored', 'group_buy')),
  source_ref text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'attached', 'created', 'dismissed')),
  submitted_at timestamptz,
  client_name text check (char_length(client_name) <= 50),
  guardian_name text check (char_length(guardian_name) <= 50),
  client_phone text check (char_length(client_phone) <= 30),
  guardian_phone text check (char_length(guardian_phone) <= 30),
  test_name text check (char_length(test_name) <= 100),
  -- 신청자가 적었지만 맞는 주문이 없었던 상품주문번호
  naver_product_order_id text check (char_length(naver_product_order_id) <= 40),
  -- 시트 한 줄 전체(신청서 + 담당자 칸). 기다리는 동안에만 있다
  payload jsonb,
  resolved_purchase_id uuid references counsel.purchases (id),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default counsel_private._now(),
  constraint application_inbox_payload check ((status = 'waiting') = (payload is not null))
);
create index application_inbox_waiting on counsel.application_inbox (created_at) where status = 'waiting';

-- 시트 한 줄을 구매 건에 붙인다: 신청서를 넣고, 비어 있는 구매 칸만 채우고, 담당자 메모는 덧붙인다.
-- 구분이 비어 있는(미분류) 구매 건이면 신청서 종류로 구분을 정한다.
create function counsel_private._attach_application(p_purchase_id uuid, p_purchase_type text, r jsonb) returns void
language plpgsql set search_path = ''
as $$
begin
  perform counsel_private._insert_application(p_purchase_id, r->'application');
  update counsel.purchases p set
    purchase_type = coalesce(p.purchase_type, p_purchase_type),
    test_option = coalesce(p.test_option, counsel_private._blank_to_null(r->>'test_option')),
    counsel_option = coalesce(p.counsel_option, counsel_private._blank_to_null(r->>'counsel_option')),
    purchase_memo = coalesce(p.purchase_memo, counsel_private._blank_to_null(r->>'purchase_memo')),
    admin_memo = nullif(concat_ws(E'\n', p.admin_memo, counsel_private._blank_to_null(r->>'admin_memo')), ''),
    updated_by = auth.uid()
  where p.id = p_purchase_id;
end
$$;

-- 시트 한 줄로 새 구매 건을 만든다(네이버 밖에서 판 협찬 등). 상품주문번호가 적혀 있으면 그 번호를 달아 두어
-- 나중에 같은 주문이 네이버에서 들어오면 이 건에 합쳐진다.
create function counsel_private._create_from_row(p_purchase_type text, p_source_ref text, r jsonb) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
  v_session uuid;
  v_order text := counsel_private._blank_to_null(r->>'naver_product_order_id');
begin
  insert into counsel.purchases (
    purchase_type, test_option, counsel_option, purchase_memo, admin_memo, source, source_ref, created_by, updated_by
  ) values (
    p_purchase_type, counsel_private._blank_to_null(r->>'test_option'), counsel_private._blank_to_null(r->>'counsel_option'),
    counsel_private._blank_to_null(r->>'purchase_memo'), counsel_private._blank_to_null(r->>'admin_memo'),
    'sheet_import', p_source_ref, auth.uid(), auth.uid()
  ) returning id into v_id;
  perform counsel_private._insert_application(v_id, r->'application');
  if v_order ~ '^[0-9]{1,40}$' then
    insert into counsel.naver_product_orders (purchase_id, naver_product_order_id) values (v_id, v_order)
    on conflict (naver_product_order_id) do nothing;
  end if;
  insert into counsel.sessions (purchase_id, seq, updated_by) values (v_id, 1, auth.uid()) returning id into v_session;
  insert into counsel.session_events (session_id, actor, kind, to_status) values (v_session, auth.uid(), 'imported', 'unassigned');
  return v_id;
end
$$;

-- 구글시트 가져오기(바뀜). 줄마다:
--   이미 가져온 줄(같은 구분 + 응답 시각·연락처·이름) → 건너뜀
--   상품주문번호가 있고, 그 번호의 구매 건에 아직 신청서가 없으면 → 그 건에 붙임
--   그 밖 → 신청서 대기함
-- 한 줄이라도 잘못되면 전체를 되돌린다.
create or replace function counsel.rpc_import_applications(p_purchase_type text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  a jsonb;
  v_ref text;
  v_order text;
  v_pid uuid;
  v_index integer := 0;
  v_attached integer := 0;
  v_waiting integer := 0;
  v_duplicates integer := 0;
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or p_purchase_type is null
    or p_purchase_type not in ('test_main', 'counsel_main', 'sponsored', 'group_buy') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'rows must be an array';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      v_ref := p_purchase_type || ':' || md5(coalesce(r->>'source_key', ''));
      if exists (select 1 from counsel.application_inbox i where i.source_ref = v_ref)
        or exists (select 1 from counsel.purchases p where p.source_ref = v_ref) then
        v_duplicates := v_duplicates + 1;
        continue;
      end if;
      if jsonb_typeof(r->'application') is distinct from 'object' then
        raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'row ' || v_index || ': application';
      end if;
      a := r->'application';
      v_order := counsel_private._blank_to_null(r->>'naver_product_order_id');
      v_pid := null;
      if v_order is not null then
        select n.purchase_id into v_pid from counsel.naver_product_orders n
        where n.naver_product_order_id = v_order
          and not exists (select 1 from counsel.applications x where x.purchase_id = n.purchase_id);
      end if;
      if v_pid is not null then
        perform counsel_private._attach_application(v_pid, p_purchase_type, r);
        insert into counsel.application_inbox (purchase_type, source_ref, status, resolved_purchase_id, resolved_by, resolved_at)
        values (p_purchase_type, v_ref, 'attached', v_pid, auth.uid(), counsel_private._now());
        v_attached := v_attached + 1;
      else
        insert into counsel.application_inbox (
          purchase_type, source_ref, submitted_at, client_name, guardian_name, client_phone, guardian_phone, test_name,
          naver_product_order_id, payload
        ) values (
          p_purchase_type, v_ref, (a->>'submitted_at')::timestamptz, counsel_private._blank_to_null(a->>'client_name'),
          counsel_private._blank_to_null(a->>'guardian_name'), counsel_private._blank_to_null(a->>'client_phone'),
          counsel_private._blank_to_null(a->>'guardian_phone'), counsel_private._blank_to_null(a->>'test_name'), v_order, r
        );
        v_waiting := v_waiting + 1;
      end if;
    exception
      when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'row ' || v_index || ': ' || sqlerrm;
    end;
  end loop;
  return jsonb_build_object('attached', v_attached, 'waiting', v_waiting, 'duplicates', v_duplicates);
end
$$;

-- 대기함 한 줄을 고른 구매 건에 붙인다
create function counsel.rpc_attach_inbox(p_inbox_id uuid, p_purchase_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  i counsel.application_inbox%rowtype;
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  select * into i from counsel.application_inbox where id = p_inbox_id and status = 'waiting' for update;
  if not found or not exists (select 1 from counsel.purchases where id = p_purchase_id) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  if exists (select 1 from counsel.applications where purchase_id = p_purchase_id) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:ALREADY_HAS_APPLICATION';
  end if;
  begin
    perform counsel_private._attach_application(p_purchase_id, i.purchase_type, i.payload);
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  update counsel.application_inbox set
    status = 'attached', resolved_purchase_id = p_purchase_id, resolved_by = auth.uid(), resolved_at = counsel_private._now(),
    payload = null, client_name = null, guardian_name = null, client_phone = null, guardian_phone = null, test_name = null, naver_product_order_id = null
  where id = i.id;
end
$$;

-- 대기함 줄들로 새 구매 건을 만든다(줄마다 1건)
create function counsel.rpc_create_from_inbox(p_inbox_ids uuid[]) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  i counsel.application_inbox%rowtype;
  v_pid uuid;
  v_count integer := 0;
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  for i in select * from counsel.application_inbox where id = any (p_inbox_ids) and status = 'waiting' order by created_at for update loop
    begin
      v_pid := counsel_private._create_from_row(i.purchase_type, i.source_ref, i.payload);
    exception
      when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
    end;
    update counsel.application_inbox set
      status = 'created', resolved_purchase_id = v_pid, resolved_by = auth.uid(), resolved_at = counsel_private._now(),
      payload = null, client_name = null, guardian_name = null, client_phone = null, guardian_phone = null, test_name = null, naver_product_order_id = null
    where id = i.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- 대기함 줄을 버린다(잘못 낸 신청서·중복 등). 내용은 지우고 다시 가져오지 않게 기록만 남긴다.
create function counsel.rpc_dismiss_inbox(p_inbox_ids uuid[]) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  update counsel.application_inbox set
    status = 'dismissed', resolved_by = auth.uid(), resolved_at = counsel_private._now(),
    payload = null, client_name = null, guardian_name = null, client_phone = null, guardian_phone = null, test_name = null, naver_product_order_id = null
  where id = any (p_inbox_ids) and status = 'waiting';
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- 6) 센터 상담사 목록(이름·메모·활동 여부만). 상담 줄과 잇는 것은 센터 계정이 생긴 뒤에 정한다.
create table counsel.center_counselors (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references counsel.centers (id),
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name)),
  memo text check (char_length(memo) <= 200),
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default counsel_private._now(),
  updated_at timestamptz not null default counsel_private._now()
);
create index center_counselors_center on counsel.center_counselors (center_id);
create trigger center_counselors_touch before update on counsel.center_counselors
  for each row execute function counsel_private.touch_version();

-- p_id 가 비어 있으면 새로 등록, 있으면 수정(읽어 간 version 과 다르면 거부)
create function counsel.rpc_save_counselor(
  p_id uuid, p_version integer, p_center_id uuid, p_name text, p_memo text, p_active boolean
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not counsel_private.has_cap('center.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  begin
    if p_id is null then
      if not exists (select 1 from counsel.centers where id = p_center_id and not is_headquarters) then
        raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
      end if;
      insert into counsel.center_counselors (center_id, name, memo, active)
      values (p_center_id, btrim(p_name), counsel_private._blank_to_null(p_memo), coalesce(p_active, true))
      returning id into v_id;
    else
      update counsel.center_counselors set name = btrim(p_name), memo = counsel_private._blank_to_null(p_memo), active = coalesce(p_active, active)
      where id = p_id and version = p_version
      returning id into v_id;
      if v_id is null then
        if exists (select 1 from counsel.center_counselors where id = p_id) then
          raise exception using errcode = 'P0001', message = 'COUNSEL:VERSION_CONFLICT';
        end if;
        raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
      end if;
    end if;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_id;
end
$$;

alter table counsel.purchase_notes enable row level security;
alter table counsel.purchase_notes force row level security;
alter table counsel.application_inbox enable row level security;
alter table counsel.application_inbox force row level security;
alter table counsel.center_counselors enable row level security;
alter table counsel.center_counselors force row level security;

create policy purchase_notes_read on counsel.purchase_notes for select to authenticated using ((select counsel_private.is_hq()));
create policy application_inbox_read on counsel.application_inbox for select to authenticated using ((select counsel_private.is_hq()));
create policy center_counselors_read on counsel.center_counselors for select to authenticated
  using ((select counsel_private.is_hq()) or center_id = any ((select counsel_private.my_center_ids())::uuid[]));

grant select on counsel.purchase_notes, counsel.application_inbox, counsel.center_counselors to authenticated;

revoke execute on all functions in schema counsel from public;
revoke execute on all functions in schema counsel_private from public;
grant execute on function counsel.rpc_update_session(uuid, integer, text, timestamptz, text, text) to authenticated;
grant execute on function counsel.rpc_add_purchase_note(uuid, text) to authenticated;
grant execute on function counsel.rpc_attach_inbox(uuid, uuid) to authenticated;
grant execute on function counsel.rpc_create_from_inbox(uuid[]) to authenticated;
grant execute on function counsel.rpc_dismiss_inbox(uuid[]) to authenticated;
grant execute on function counsel.rpc_save_counselor(uuid, integer, uuid, text, text, boolean) to authenticated;
