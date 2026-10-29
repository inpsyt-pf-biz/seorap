-- 상담 신청서 템플릿 (서랍 B2, Works-archive b2-counsel-forms-design.md)
-- 템플릿을 편집해 게시하면 판(form_template_versions)이 하나 생기고, 게시한 판은 고치거나 지우지 않는다.
-- 상품(관리코드)에 템플릿을 연결하면, 서랍이 그 상품 구매자에게 최신 게시 판으로 신청서를 띄운다.
-- 서랍은 신청서 답을 저장하지 않고 rpc_seorap_submit_application 으로 이 원장에 바로 넘긴다.

insert into counsel.role_caps (member_role, cap) values ('hq_admin', 'form.manage');

-- 서랍에서 제출되어 생긴 구매 건
alter table counsel.purchases drop constraint purchases_source_check;
alter table counsel.purchases add constraint purchases_source_check check (source in ('manual', 'sheet_import', 'naver', 'seorap'));

create table counsel.form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  -- 편집 중인 정의(서랍 _shared/core/counselForm.ts 의 FormDefinition). 게시하면 그대로 판으로 굳는다
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  published_version integer,
  version integer not null default 1,
  created_at timestamptz not null default counsel_private._now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default counsel_private._now(),
  updated_by uuid references auth.users (id)
);
create unique index form_templates_name_unique on counsel.form_templates (lower(name));
create trigger form_templates_touch before update on counsel.form_templates for each row execute function counsel_private.touch_version();

create table counsel.form_template_versions (
  template_id uuid not null references counsel.form_templates (id),
  version integer not null check (version >= 1),
  definition jsonb not null,
  published_at timestamptz not null default counsel_private._now(),
  published_by uuid references auth.users (id),
  primary key (template_id, version)
);
-- 제출에는 판 번호가 남는다. 판을 고치면 누가 어떤 문구에 동의했는지 알 수 없게 되므로 막는다
create trigger form_template_versions_append_only before update or delete on counsel.form_template_versions
  for each row execute function counsel_private.append_only();

-- 관리코드(스토어 판매자관리코드·옵션 관리코드, 영문·숫자·-·_ 20자) → 템플릿
create table counsel.form_product_links (
  manage_code text primary key check (manage_code ~ '^[A-Za-z0-9_-]{1,20}$'),
  template_id uuid not null references counsel.form_templates (id),
  purchase_type text not null check (purchase_type in ('test_main', 'counsel_main', 'sponsored', 'group_buy')),
  -- 'counsel_first' = 신청서 제출 전 검사 잠금. 'test_first'(검사를 마친 뒤 신청서)는 나중에 더한다
  flow text not null default 'counsel_first' check (flow in ('counsel_first')),
  enabled boolean not null default true,
  label text check (char_length(label) <= 200),
  updated_at timestamptz not null default counsel_private._now(),
  updated_by uuid references auth.users (id)
);

-- 서랍에서 낸 신청서의 템플릿·판, 기존 칸에 연결되지 않은 답, 동의 기록
create table counsel.application_answers (
  purchase_id uuid primary key references counsel.purchases (id),
  template_id uuid not null references counsel.form_templates (id),
  template_version integer not null,
  extra jsonb not null default '[]'::jsonb check (jsonb_typeof(extra) = 'array'),
  consents jsonb not null default '[]'::jsonb check (jsonb_typeof(consents) = 'array'),
  created_at timestamptz not null default counsel_private._now(),
  foreign key (template_id, template_version) references counsel.form_template_versions (template_id, version)
);
-- 민감정보로 표시했지만 기존 칸이 없는 답은 민감정보 표에 함께 둔다(같은 읽기 권한)
alter table counsel.application_sensitive add column extra jsonb not null default '[]'::jsonb check (jsonb_typeof(extra) = 'array');

alter table counsel.form_templates enable row level security;
alter table counsel.form_templates force row level security;
alter table counsel.form_template_versions enable row level security;
alter table counsel.form_template_versions force row level security;
alter table counsel.form_product_links enable row level security;
alter table counsel.form_product_links force row level security;
alter table counsel.application_answers enable row level security;
alter table counsel.application_answers force row level security;
create policy form_templates_read on counsel.form_templates for select to authenticated using ((select counsel_private.is_hq()));
create policy form_template_versions_read on counsel.form_template_versions for select to authenticated using ((select counsel_private.is_hq()));
create policy form_product_links_read on counsel.form_product_links for select to authenticated using ((select counsel_private.is_hq()));
create policy application_answers_read on counsel.application_answers for select to authenticated using ((select counsel_private.is_hq()));
grant select on counsel.form_templates, counsel.form_template_versions, counsel.form_product_links, counsel.application_answers to authenticated;

create function counsel_private._require_form_manage() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not counsel_private.has_cap('form.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
end
$$;

create function counsel.rpc_create_form_template(p_name text, p_draft jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform counsel_private._require_form_manage();
  begin
    insert into counsel.form_templates (name, draft, created_by, updated_by)
    values (btrim(p_name), p_draft, auth.uid(), auth.uid()) returning id into v_id;
  exception
    when unique_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:DUPLICATE_NAME';
    when check_violation or not_null_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_id;
end
$$;

-- 초안 저장. 화면이 읽어 간 version 과 다르면 거부한다(다른 사람이 먼저 고침). 이름은 null 이면 그대로
create function counsel.rpc_save_form_draft(p_id uuid, p_version integer, p_name text, p_draft jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_new integer;
begin
  perform counsel_private._require_form_manage();
  begin
    update counsel.form_templates set
      name = coalesce(btrim(p_name), name), draft = coalesce(p_draft, draft), updated_by = auth.uid()
    where id = p_id and version = p_version
    returning version into v_new;
  exception
    when unique_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:DUPLICATE_NAME';
    when check_violation or not_null_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  if v_new is null then
    if exists (select 1 from counsel.form_templates where id = p_id) then
      raise exception using errcode = 'P0001', message = 'COUNSEL:VERSION_CONFLICT';
    end if;
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  return v_new;
end
$$;

-- 게시: 지금 초안을 새 판으로 굳힌다. 문항 검사의 정본은 counselForm.checkDefinition(화면)이고, 여기서는 모양만 본다
create function counsel.rpc_publish_form_template(p_id uuid, p_version integer) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  t counsel.form_templates%rowtype;
  v_next integer;
begin
  perform counsel_private._require_form_manage();
  select * into t from counsel.form_templates where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  if t.version <> p_version then
    raise exception using errcode = 'P0001', message = 'COUNSEL:VERSION_CONFLICT';
  end if;
  if jsonb_typeof(t.draft->'fields') is distinct from 'array' or jsonb_array_length(t.draft->'fields') = 0 then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'no fields';
  end if;
  v_next := coalesce(t.published_version, 0) + 1;
  insert into counsel.form_template_versions (template_id, version, definition, published_by) values (p_id, v_next, t.draft, auth.uid());
  update counsel.form_templates set published_version = v_next, updated_by = auth.uid() where id = p_id;
  return v_next;
end
$$;

create function counsel.rpc_set_form_link(p_manage_code text, p_template_id uuid, p_purchase_type text, p_enabled boolean, p_label text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform counsel_private._require_form_manage();
  begin
    insert into counsel.form_product_links (manage_code, template_id, purchase_type, enabled, label, updated_by)
    values (btrim(p_manage_code), p_template_id, p_purchase_type, coalesce(p_enabled, true), counsel_private._blank_to_null(p_label), auth.uid())
    on conflict (manage_code) do update set
      template_id = excluded.template_id, purchase_type = excluded.purchase_type, enabled = excluded.enabled,
      label = excluded.label, updated_at = counsel_private._now(), updated_by = excluded.updated_by;
  exception
    when check_violation or not_null_violation or foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
end
$$;

-- 서랍 연결 통로 ① 상품의 최신 게시 신청서. 연결이 없거나 꺼졌거나 게시한 판이 없으면 null
create function counsel.rpc_seorap_form_for(p_manage_code text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('template_id', t.id, 'version', v.version, 'flow', l.flow, 'purchase_type', l.purchase_type, 'definition', v.definition)
  from counsel.form_product_links l
  join counsel.form_templates t on t.id = l.template_id
  join counsel.form_template_versions v on v.template_id = t.id and v.version = t.published_version
  where l.manage_code = p_manage_code and l.enabled
$$;

-- 서랍 연결 통로 ② 제출된 신청서 받기. p: naver_product_order_id, external_order_id, manage_code, product_name,
-- template_id, template_version, submitted_at, application(기존 칸), extra, sensitive_extra, consents.
-- 같은 상품주문번호로 다시 오면 처음 건을 돌려준다(created = false). 시트로 먼저 들어온 신청서가 있으면 거부한다.
create function counsel.rpc_seorap_submit_application(p jsonb) returns jsonb
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
  select * into v_link from counsel.form_product_links where manage_code = p->>'manage_code' and template_id = (p->>'template_id')::uuid;
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

revoke all on function counsel.rpc_seorap_form_for(text) from public, anon, authenticated;
revoke all on function counsel.rpc_seorap_submit_application(jsonb) from public, anon, authenticated;
grant execute on function counsel.rpc_seorap_form_for(text) to service_role;
grant execute on function counsel.rpc_seorap_submit_application(jsonb) to service_role;
