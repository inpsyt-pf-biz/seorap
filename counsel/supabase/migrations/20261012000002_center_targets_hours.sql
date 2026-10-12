-- MVP-0.5: 해석상담 기획 문서 Step 1·2에 맞춘다.
-- 대상(영유아 / 아동·청소년 / 성인)과 운영 시간을 더하고, 카테고리는 "전문 분야"(specialties)로 이름을 바꾼다.

alter table counsel.centers rename column categories to specialties;
alter table counsel.centers
  add column target_groups text[] not null default '{}' check (target_groups <@ array['infant', 'child_youth', 'adult']::text[]),
  add column operating_hours text check (char_length(operating_hours) <= 100);

-- 함수의 입력 칸이 바뀌므로 지우고 다시 만든다
drop function counsel.rpc_create_center(text, text, text, text, double precision, double precision, text[], text[], text[], text, text, text, text, date, date, text);
drop function counsel.rpc_update_center(uuid, integer, text, text, text, text, double precision, double precision, text[], text[], text[], text, text, text, text, date, date, text);

create function counsel.rpc_create_center(
  p_name text,
  p_status text,
  p_location_sido text,
  p_location_sigungu text,
  p_latitude double precision,
  p_longitude double precision,
  p_target_groups text[],
  p_specialties text[],
  p_regions text[],
  p_delivery_modes text[],
  p_phone text,
  p_address text,
  p_operating_hours text,
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
      name, status, location_sido, location_sigungu, latitude, longitude, target_groups, specialties, regions, delivery_modes,
      phone, address, operating_hours, contact_name, contact_phone, contract_from, contract_to, memo, created_by, updated_by
    ) values (
      btrim(p_name), coalesce(p_status, 'onboarding'),
      counsel_private._blank_to_null(p_location_sido), counsel_private._blank_to_null(p_location_sigungu),
      p_latitude, p_longitude,
      counsel_private._dedupe(p_target_groups), counsel_private._dedupe(p_specialties),
      counsel_private._dedupe(p_regions), counsel_private._dedupe(p_delivery_modes),
      counsel_private._blank_to_null(p_phone), counsel_private._blank_to_null(p_address), counsel_private._blank_to_null(p_operating_hours),
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

create function counsel.rpc_update_center(
  p_id uuid,
  p_version integer,
  p_name text,
  p_status text,
  p_location_sido text,
  p_location_sigungu text,
  p_latitude double precision,
  p_longitude double precision,
  p_target_groups text[],
  p_specialties text[],
  p_regions text[],
  p_delivery_modes text[],
  p_phone text,
  p_address text,
  p_operating_hours text,
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
      location_sido = counsel_private._blank_to_null(p_location_sido),
      location_sigungu = counsel_private._blank_to_null(p_location_sigungu),
      latitude = p_latitude,
      longitude = p_longitude,
      target_groups = counsel_private._dedupe(p_target_groups),
      specialties = counsel_private._dedupe(p_specialties),
      regions = counsel_private._dedupe(p_regions),
      delivery_modes = counsel_private._dedupe(p_delivery_modes),
      phone = counsel_private._blank_to_null(p_phone),
      address = counsel_private._blank_to_null(p_address),
      operating_hours = counsel_private._blank_to_null(p_operating_hours),
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

revoke execute on function counsel.rpc_create_center(text, text, text, text, double precision, double precision, text[], text[], text[], text[], text, text, text, text, text, date, date, text) from public;
revoke execute on function counsel.rpc_update_center(uuid, integer, text, text, text, text, double precision, double precision, text[], text[], text[], text[], text, text, text, text, text, date, date, text) from public;
grant execute on function counsel.rpc_create_center(text, text, text, text, double precision, double precision, text[], text[], text[], text[], text, text, text, text, text, date, date, text) to authenticated;
grant execute on function counsel.rpc_update_center(uuid, integer, text, text, text, text, double precision, double precision, text[], text[], text[], text[], text, text, text, text, text, date, date, text) to authenticated;
