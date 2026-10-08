-- 협력상담센터 관리 MVP-0: 센터·소속·능력표, 권한 판정 함수, 센터 등록·수정 함수.
-- 화면은 표를 읽기만 한다. 쓰기는 counsel.rpc_* 함수로만 하고, 표에 직접 쓰는 권한은 아무에게도 주지 않는다.

create schema if not exists counsel;
create schema if not exists counsel_private;

-- 새 함수에 붙는 "누구나 실행" 권한을 거둔다. 필요한 함수에만 아래에서 하나씩 준다.
alter default privileges in schema counsel revoke execute on functions from public;
alter default privileges in schema counsel_private revoke execute on functions from public;

grant usage on schema counsel to authenticated;
grant usage on schema counsel_private to authenticated;

-- 시드와 시험이 가짜 시각을 쓸 수 있도록 현재 시각은 이 함수로만 얻는다.
create function counsel_private._now() returns timestamptz
language sql stable set search_path = ''
as $$ select now() $$;

-- 빈 문자열과 앞뒤 공백만 있는 값은 빈칸으로 저장한다.
create function counsel_private._blank_to_null(p text) returns text
language sql immutable set search_path = ''
as $$ select nullif(btrim(p), '') $$;

create function counsel_private._dedupe(p text[]) returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array(select distinct x from unnest(p) x where x is not null order by x), '{}') $$;

-- 협력센터. 인싸이트 본사도 이 표의 한 행이다(is_headquarters). 행은 지우지 않고 status 로 끝낸다.
create table counsel.centers (
  id uuid primary key default gen_random_uuid(),
  is_headquarters boolean not null default false,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  status text not null default 'onboarding' check (status in ('onboarding', 'active', 'paused', 'terminated')),
  regions text[] not null default '{}' check (regions <@ array[
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
  ]::text[]),
  counseling_types text[] not null default '{}' check (counseling_types <@ array[
    'individual', 'couple', 'family', 'child_youth', 'play_therapy', 'test_interpretation'
  ]::text[]),
  delivery_modes text[] not null default '{}' check (delivery_modes <@ array['offline', 'online']::text[]),
  phone text check (phone ~ '^[0-9-]{8,20}$'),
  address text check (char_length(address) <= 200),
  contact_name text check (char_length(contact_name) <= 30),
  contact_phone text check (contact_phone ~ '^[0-9-]{8,20}$'),
  contract_from date,
  contract_to date,
  memo text check (char_length(memo) <= 500),
  version integer not null default 1,
  created_at timestamptz not null default counsel_private._now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default counsel_private._now(),
  updated_by uuid references auth.users (id),
  constraint centers_contract_period check (contract_from is null or contract_to is null or contract_from <= contract_to)
);
create unique index centers_one_headquarters on counsel.centers (is_headquarters) where is_headquarters;
create unique index centers_name_unique on counsel.centers (lower(name));

-- 화면에 보일 이름. 이메일은 로그인 계정 쪽에만 있다.
create table counsel.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30 and display_name = btrim(display_name)),
  created_at timestamptz not null default counsel_private._now()
);

-- 계정 있는 사람의 소속과 역할. 소속을 끝낼 때는 행을 지우지 않고 left_at 을 채운다. 활성 소속은 사람당 1건.
create table counsel.center_members (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references counsel.centers (id),
  user_id uuid not null references auth.users (id),
  member_role text not null check (member_role in ('hq_admin', 'hq_manager', 'center_scheduler', 'center_viewer')),
  joined_at timestamptz not null default counsel_private._now(),
  left_at timestamptz,
  check (left_at is null or left_at >= joined_at)
);
create unique index center_members_one_active on counsel.center_members (user_id) where left_at is null;
create index center_members_center on counsel.center_members (center_id);

-- 역할 × 능력. 권한의 정본은 이 표 하나다. 화면은 사본을 갖지 않고 my_context() 로 받는다.
create table counsel.role_caps (
  member_role text not null check (member_role in ('hq_admin', 'hq_manager', 'center_scheduler', 'center_viewer')),
  cap text not null,
  primary key (member_role, cap)
);
insert into counsel.role_caps (member_role, cap) values ('hq_admin', 'center.manage');

-- hq_* 역할은 본사 행에만, center_* 역할은 일반 센터에만 붙는다.
create function counsel_private.check_member_role() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_hq boolean;
begin
  select c.is_headquarters into v_hq from counsel.centers c where c.id = new.center_id;
  if v_hq is distinct from (new.member_role like 'hq\_%') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:ROLE_CENTER_MISMATCH';
  end if;
  return new;
end
$$;
create trigger center_members_role_check before insert or update on counsel.center_members
  for each row execute function counsel_private.check_member_role();

-- 고칠 때마다 version 을 1 올린다. 함수가 빠뜨려도 DB가 올린다.
create function counsel_private.touch_version() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := counsel_private._now();
  return new;
end
$$;
create trigger centers_touch before update on counsel.centers
  for each row execute function counsel_private.touch_version();

-- 판정 함수. 권한 규칙 본문에는 이 함수들만 쓴다. 소속 행을 요청마다 읽으므로 소속을 끝내면 다음 요청부터 막힌다.
create function counsel_private.my_center_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.center_id), '{}')
  from counsel.center_members m
  join counsel.centers c on c.id = m.center_id
  where m.user_id = auth.uid() and m.left_at is null and c.status <> 'terminated'
$$;

create function counsel_private.is_hq() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from counsel.center_members m
    join counsel.centers c on c.id = m.center_id
    where m.user_id = auth.uid() and m.left_at is null and c.is_headquarters
  )
$$;

create function counsel_private.has_cap(p_cap text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from counsel.center_members m
    join counsel.centers c on c.id = m.center_id
    join counsel.role_caps r on r.member_role = m.member_role
    where m.user_id = auth.uid() and m.left_at is null and c.status <> 'terminated' and r.cap = p_cap
  )
$$;

create function counsel_private.is_self(p_user_id uuid) returns boolean
language sql stable set search_path = ''
as $$ select p_user_id = auth.uid() $$;

-- 행 단위 권한. 읽기 규칙만 두고, 쓰기 규칙은 두지 않는다(쓰기는 함수로만).
alter table counsel.centers enable row level security;
alter table counsel.centers force row level security;
alter table counsel.profiles enable row level security;
alter table counsel.profiles force row level security;
alter table counsel.center_members enable row level security;
alter table counsel.center_members force row level security;
alter table counsel.role_caps enable row level security;
alter table counsel.role_caps force row level security;

create policy centers_read on counsel.centers for select to authenticated
  using ((select counsel_private.is_hq()) or id = any ((select counsel_private.my_center_ids())::uuid[]));
create policy profiles_read on counsel.profiles for select to authenticated
  using (counsel_private.is_self(user_id) or (select counsel_private.is_hq()));
create policy center_members_read on counsel.center_members for select to authenticated
  using (counsel_private.is_self(user_id) or (select counsel_private.is_hq()));

grant select on counsel.centers, counsel.profiles, counsel.center_members to authenticated;

-- 화면이 로그인 직후 부르는 함수: 내 이름, 소속, 역할, 능력 목록.
create function counsel.my_context() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'display_name', (select p.display_name from counsel.profiles p where p.user_id = auth.uid()),
    'membership', (
      select jsonb_build_object('center_id', c.id, 'center_name', c.name, 'is_headquarters', c.is_headquarters, 'role', m.member_role)
      from counsel.center_members m
      join counsel.centers c on c.id = m.center_id
      where m.user_id = auth.uid() and m.left_at is null and c.status <> 'terminated'
    ),
    'caps', coalesce((
      select jsonb_agg(r.cap order by r.cap)
      from counsel.center_members m
      join counsel.centers c on c.id = m.center_id
      join counsel.role_caps r on r.member_role = m.member_role
      where m.user_id = auth.uid() and m.left_at is null and c.status <> 'terminated'
    ), '[]'::jsonb)
  )
$$;

-- 센터 등록. 오류는 'COUNSEL:<코드>' 문구로 던지고, 문장은 화면이 코드로 만든다.
create function counsel.rpc_create_center(
  p_name text,
  p_status text,
  p_regions text[],
  p_counseling_types text[],
  p_delivery_modes text[],
  p_phone text,
  p_address text,
  p_contact_name text,
  p_contact_phone text,
  p_contract_from date,
  p_contract_to date,
  p_memo text
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
    insert into counsel.centers (
      name, status, regions, counseling_types, delivery_modes, phone, address,
      contact_name, contact_phone, contract_from, contract_to, memo, created_by, updated_by
    ) values (
      btrim(p_name), coalesce(p_status, 'onboarding'),
      counsel_private._dedupe(p_regions), counsel_private._dedupe(p_counseling_types), counsel_private._dedupe(p_delivery_modes),
      counsel_private._blank_to_null(p_phone), counsel_private._blank_to_null(p_address),
      counsel_private._blank_to_null(p_contact_name), counsel_private._blank_to_null(p_contact_phone),
      p_contract_from, p_contract_to, counsel_private._blank_to_null(p_memo), auth.uid(), auth.uid()
    ) returning id into v_id;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:DUPLICATE_NAME';
    when check_violation or not_null_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_id;
end
$$;

-- 센터 수정. 화면이 읽어 간 version 과 지금 version 이 다르면 거부한다(다른 사람이 먼저 고침).
create function counsel.rpc_update_center(
  p_id uuid,
  p_version integer,
  p_name text,
  p_status text,
  p_regions text[],
  p_counseling_types text[],
  p_delivery_modes text[],
  p_phone text,
  p_address text,
  p_contact_name text,
  p_contact_phone text,
  p_contract_from date,
  p_contract_to date,
  p_memo text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_version integer;
  v_hq boolean;
  v_new integer;
begin
  if not counsel_private.has_cap('center.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  select c.version, c.is_headquarters into v_version, v_hq from counsel.centers c where c.id = p_id for update;
  if not found or v_hq then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  if v_version <> p_version then
    raise exception using errcode = 'P0001', message = 'COUNSEL:VERSION_CONFLICT', detail = v_version::text;
  end if;
  begin
    update counsel.centers set
      name = btrim(p_name),
      status = p_status,
      regions = counsel_private._dedupe(p_regions),
      counseling_types = counsel_private._dedupe(p_counseling_types),
      delivery_modes = counsel_private._dedupe(p_delivery_modes),
      phone = counsel_private._blank_to_null(p_phone),
      address = counsel_private._blank_to_null(p_address),
      contact_name = counsel_private._blank_to_null(p_contact_name),
      contact_phone = counsel_private._blank_to_null(p_contact_phone),
      contract_from = p_contract_from,
      contract_to = p_contract_to,
      memo = counsel_private._blank_to_null(p_memo),
      updated_by = auth.uid()
    where id = p_id
    returning version into v_new;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:DUPLICATE_NAME';
    when check_violation or not_null_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_new;
end
$$;

-- 기본 권한 회수가 적용되지 않는 실행 환경에 대비해 한 번 더 거둔 뒤, 필요한 함수에만 준다.
revoke execute on all functions in schema counsel from public;
revoke execute on all functions in schema counsel_private from public;
grant execute on function counsel_private.my_center_ids() to authenticated;
grant execute on function counsel_private.is_hq() to authenticated;
grant execute on function counsel_private.has_cap(text) to authenticated;
grant execute on function counsel_private.is_self(uuid) to authenticated;
grant execute on function counsel.my_context() to authenticated;
grant execute on function counsel.rpc_create_center(text, text, text[], text[], text[], text, text, text, text, date, date, text) to authenticated;
grant execute on function counsel.rpc_update_center(uuid, integer, text, text, text[], text[], text[], text, text, text, text, date, date, text) to authenticated;
