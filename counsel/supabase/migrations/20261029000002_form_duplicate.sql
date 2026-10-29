-- 신청서 템플릿 복제 (서랍 B2, 10-29 건우님: 상품마다 구조가 비슷하다).
-- 원본의 저장된 초안을 새 템플릿의 초안으로 복사한다. 판(게시 이력)과 상품 연결은 복사하지 않는다
create function counsel.rpc_duplicate_form_template(p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_draft jsonb;
  v_id uuid;
begin
  perform counsel_private._require_form_manage();
  select draft into v_draft from counsel.form_templates where id = p_id;
  if v_draft is null then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  begin
    insert into counsel.form_templates (name, draft, created_by, updated_by)
    values (btrim(p_name), v_draft, auth.uid(), auth.uid()) returning id into v_id;
  exception
    when unique_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:DUPLICATE_NAME';
    when check_violation or not_null_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_id;
end
$$;
