-- 서랍 연결 통로 보강 (11-04)
-- ① 신청서를 가져올 때 "제공받는 업체 정보"(개인정보 제3자 제공 동의에서 볼 협력센터 목록)를 함께 준다
-- ② 서랍이 검사 잠금을 풀 때(예약 확정 뒤) 볼 회차 상태를 준다

-- 운영 중인 협력센터. 본사는 상담을 하지 않으므로 빼고, 담당자 이름·연락처(내부용)는 내보내지 않는다
create function counsel_private._seorap_providers() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone, 'address', c.address) order by c.name), '[]'::jsonb)
  from counsel.centers c
  where c.status = 'active' and not c.is_headquarters
$$;
revoke all on function counsel_private._seorap_providers() from public, anon, authenticated;

create or replace function counsel.rpc_seorap_form_for(p_manage_code text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'template_id', t.id, 'version', v.version, 'flow', l.flow, 'purchase_type', l.purchase_type, 'definition', v.definition,
    'providers', counsel_private._seorap_providers()
  )
  from counsel.form_product_links l
  join counsel.form_templates t on t.id = l.template_id
  join counsel.form_template_versions v on v.template_id = t.id and v.version = t.published_version
  where l.manage_code = p_manage_code and l.enabled
$$;
revoke all on function counsel.rpc_seorap_form_for(text) from public, anon, authenticated;
grant execute on function counsel.rpc_seorap_form_for(text) to service_role;

-- 서랍 연결 통로 ③ 예약 상태. 서랍이 제출 때 받은 구매 건 ID 로 묻는다. 회차마다 상태·예약 일시·센터 이름
create function counsel.rpc_seorap_counsel_status(p_purchase_ids uuid[]) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'purchase_id', s.purchase_id, 'seq', s.seq, 'status', s.status, 'scheduled_at', s.scheduled_at, 'center_name', c.name
  ) order by s.purchase_id, s.seq), '[]'::jsonb)
  from counsel.sessions s
  left join counsel.centers c on c.id = s.center_id
  where s.purchase_id = any (p_purchase_ids)
$$;
revoke all on function counsel.rpc_seorap_counsel_status(uuid[]) from public, anon, authenticated;
grant execute on function counsel.rpc_seorap_counsel_status(uuid[]) to service_role;
