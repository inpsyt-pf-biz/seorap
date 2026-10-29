-- 10-29 보안 검토 정리 (서랍 B2)
-- 1) 서랍 제출도 상품 연결이 켜져 있을 때만 받는다(가져오기 rpc_seorap_form_for 와 같은 조건).
--    신청서를 연 뒤 관리자가 연결을 끈 경우의 제출 1건을 막는다
-- 2) 관리 함수의 실행 권한을 명시한다. 앞선 마이그레이션처럼 authenticated 에만 주고, 권한(form.manage)은 함수 안에서 본다.
--    클라우드 프로젝트의 기본 권한 설정이 로컬과 달라도 어드민 화면이 같은 결과를 내게 한다

create or replace function counsel.rpc_seorap_submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order text := p->>'naver_product_order_id';
  v_link counsel.form_product_links%rowtype;
  v_pid uuid;
  v_session uuid;
begin
  if v_order is null or v_order !~ '^[0-9]{1,40}$' or jsonb_typeof(p->'application') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'order or application';
  end if;
  select * into v_link from counsel.form_product_links where manage_code = p->>'manage_code' and template_id = (p->>'template_id')::uuid and enabled;
  if not found or not exists (
    select 1 from counsel.form_template_versions where template_id = v_link.template_id and version = (p->>'template_version')::integer
  ) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'template';
  end if;

  -- 같은 주문의 동시 제출을 한 줄로 세운다
  perform pg_advisory_xact_lock(hashtext('seorap_submit:' || v_order));
  select purchase_id into v_pid from counsel.naver_product_orders where naver_product_order_id = v_order;
  if v_pid is not null and exists (select 1 from counsel.application_answers where purchase_id = v_pid) then
    return jsonb_build_object('purchase_id', v_pid, 'created', false);
  end if;
  if v_pid is not null and exists (select 1 from counsel.applications where purchase_id = v_pid) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:ALREADY_HAS_APPLICATION';
  end if;

  if v_pid is null then
    -- 주문번호는 구매 건이 아니라 네이버 주문 표(external_order_id)에 둔다 (20261012000004 이후)
    insert into counsel.purchases (purchase_type, product_name, source)
    values (v_link.purchase_type, counsel_private._blank_to_null(p->>'product_name'), 'seorap')
    returning id into v_pid;
    insert into counsel.naver_product_orders (purchase_id, naver_product_order_id, external_order_id) values (v_pid, v_order, counsel_private._blank_to_null(p->>'external_order_id'));
    insert into counsel.sessions (purchase_id, seq) values (v_pid, 1) returning id into v_session;
    insert into counsel.session_events (session_id, kind, to_status, note) values (v_session, 'imported', 'unassigned', '서랍 신청서');
  end if;

  perform counsel_private._insert_application(v_pid, (p->'application') || jsonb_build_object('submitted_at', p->>'submitted_at'));
  if jsonb_array_length(coalesce(p->'sensitive_extra', '[]'::jsonb)) > 0 then
    insert into counsel.application_sensitive (purchase_id, extra) values (v_pid, p->'sensitive_extra')
    on conflict (purchase_id) do update set extra = excluded.extra;
  end if;
  insert into counsel.application_answers (purchase_id, template_id, template_version, extra, consents)
  values (v_pid, v_link.template_id, (p->>'template_version')::integer, coalesce(p->'extra', '[]'::jsonb), coalesce(p->'consents', '[]'::jsonb));
  return jsonb_build_object('purchase_id', v_pid, 'created', true);
end
$$;

revoke all on function counsel.rpc_seorap_submit_application(jsonb) from public, anon, authenticated;
grant execute on function counsel.rpc_seorap_submit_application(jsonb) to service_role;

grant execute on function counsel.rpc_create_form_template(text, jsonb) to authenticated;
grant execute on function counsel.rpc_save_form_draft(uuid, integer, text, jsonb) to authenticated;
grant execute on function counsel.rpc_publish_form_template(uuid, integer) to authenticated;
grant execute on function counsel.rpc_set_form_link(text, uuid, text, boolean, text) to authenticated;
grant execute on function counsel.rpc_duplicate_form_template(uuid, text) to authenticated;
