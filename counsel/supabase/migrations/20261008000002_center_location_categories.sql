-- 센터 목록 정리: 소재지(시·도 + 구·시)를 더하고, 상담 유형 6종을 카테고리 5종(발달·정서·청소년·학습·가족)으로 바꾼다.
-- 기존 regions 는 "상담 가능 지역"으로 남긴다(배정 후보를 고를 때 쓴다). 배정 건수는 예약 표가 생기는 단계에서 센다.

alter table counsel.centers drop column counseling_types;
alter table counsel.centers
  add column categories text[] not null default '{}' check (categories <@ array['development', 'emotion', 'youth', 'learning', 'family']::text[]),
  add column location_sido text check (location_sido in (
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
  )),
  add column location_sigungu text check (char_length(location_sigungu) between 1 and 20 and location_sigungu = btrim(location_sigungu)),
  add constraint centers_location_order check (location_sigungu is null or location_sido is not null);

-- 함수의 입력 칸이 바뀌므로 지우고 다시 만든다
drop function counsel.rpc_create_center(text, text, text[], text[], text[], text, text, text, text, date, date, text);
drop function counsel.rpc_update_center(uuid, integer, text, text, text[], text[], text[], text, text, text, text, date, date, text);

create function counsel.rpc_create_center(
  p_name text,
  p_status text,
  p_location_sido text,
  p_location_sigungu text,
  p_categories text[],
  p_regions text[],
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
      name, status, location_sido, location_sigungu, categories, regions, delivery_modes, phone, address,
      contact_name, contact_phone, contract_from, contract_to, memo, created_by, updated_by
    ) values (
      btrim(p_name), coalesce(p_status, 'onboarding'),
      counsel_private._blank_to_null(p_location_sido), counsel_private._blank_to_null(p_location_sigungu),
      counsel_private._dedupe(p_categories), counsel_private._dedupe(p_regions), counsel_private._dedupe(p_delivery_modes),
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

create function counsel.rpc_update_center(
  p_id uuid,
  p_version integer,
  p_name text,
  p_status text,
  p_location_sido text,
  p_location_sigungu text,
  p_categories text[],
  p_regions text[],
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
      location_sido = counsel_private._blank_to_null(p_location_sido),
      location_sigungu = counsel_private._blank_to_null(p_location_sigungu),
      categories = counsel_private._dedupe(p_categories),
      regions = counsel_private._dedupe(p_regions),
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

revoke execute on function counsel.rpc_create_center(text, text, text, text, text[], text[], text[], text, text, text, text, date, date, text) from public;
revoke execute on function counsel.rpc_update_center(uuid, integer, text, text, text, text, text[], text[], text[], text, text, text, text, date, date, text) from public;
grant execute on function counsel.rpc_create_center(text, text, text, text, text[], text[], text[], text, text, text, text, date, date, text) to authenticated;
grant execute on function counsel.rpc_update_center(uuid, integer, text, text, text, text, text[], text[], text[], text, text, text, text, date, date, text) to authenticated;
