-- 서랍 도움말 (10-30, Works-archive help-admin-design.md)
-- 서랍 도움말 화면에 보이는 질문·답(마크다운)·링크 버튼·순서·숨김·문의처를 상담 어드민에서 고친다.
-- 서랍은 rpc_seorap_help 로 읽어 1분 기억한다. 검사 규칙의 정본은 서랍 _shared/core/helpContent.ts 이고, 여기서도 같은 규칙으로 막는다

insert into counsel.role_caps (member_role, cap) values ('hq_admin', 'help.manage');

-- 링크 버튼: [{label 1~20자, url https:// 또는 tel:}] 0~2개
create function counsel_private._help_buttons_ok(b jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(b) = 'array' and jsonb_array_length(b) <= 2 and not exists (
    select 1 from jsonb_array_elements(b) e
    where jsonb_typeof(e) <> 'object'
       or char_length(btrim(coalesce(e->>'label', ''))) not between 1 and 20
       or char_length(coalesce(e->>'url', '')) > 500
       or coalesce(e->>'url', '') !~ '^(https://[^[:space:]<>"]+|tel:\+?[0-9-]{3,20})$'
  )
$$;

create table counsel.help_items (
  id uuid primary key default gen_random_uuid(),
  position integer not null,
  question text not null check (char_length(question) between 1 and 80 and question = btrim(question)),
  answer_md text not null check (char_length(answer_md) between 1 and 2000 and answer_md = btrim(answer_md)),
  buttons jsonb not null default '[]'::jsonb check (counsel_private._help_buttons_ok(buttons)),
  hidden boolean not null default false,
  updated_at timestamptz not null default counsel_private._now(),
  updated_by uuid references auth.users (id)
);
create unique index help_items_position_unique on counsel.help_items (position);

create table counsel.help_settings (
  id boolean primary key default true check (id),
  contact_md text not null default '' check (char_length(contact_md) <= 300),
  updated_at timestamptz not null default counsel_private._now(),
  updated_by uuid references auth.users (id)
);

alter table counsel.help_items enable row level security;
alter table counsel.help_items force row level security;
alter table counsel.help_settings enable row level security;
alter table counsel.help_settings force row level security;
create policy help_items_read on counsel.help_items for select to authenticated using ((select counsel_private.is_hq()));
create policy help_settings_read on counsel.help_settings for select to authenticated using ((select counsel_private.is_hq()));
grant select on counsel.help_items, counsel.help_settings to authenticated;

create function counsel_private._require_help_manage() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not counsel_private.has_cap('help.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
end
$$;

-- 질문 쓰기·고치기. p_id 가 null 이면 맨 끝에 새로 만든다
create function counsel.rpc_save_help_item(p_id uuid, p_question text, p_answer_md text, p_buttons jsonb, p_hidden boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform counsel_private._require_help_manage();
  -- 순서 바꾸기·새 질문이 자리 번호를 함께 다루므로 한 줄로 세운다
  perform pg_advisory_xact_lock(hashtext('counsel_help_order'));
  begin
    if p_id is null then
      insert into counsel.help_items (position, question, answer_md, buttons, hidden, updated_by)
      values ((select coalesce(max(position), 0) + 1 from counsel.help_items), btrim(p_question), btrim(p_answer_md),
              coalesce(p_buttons, '[]'::jsonb), coalesce(p_hidden, false), auth.uid())
      returning id into v_id;
    else
      update counsel.help_items set question = btrim(p_question), answer_md = btrim(p_answer_md), buttons = coalesce(p_buttons, '[]'::jsonb),
        hidden = coalesce(p_hidden, false), updated_at = counsel_private._now(), updated_by = auth.uid()
      where id = p_id returning id into v_id;
      if v_id is null then
        raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
      end if;
    end if;
  exception
    when check_violation or not_null_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_id;
end
$$;

create function counsel.rpc_delete_help_item(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform counsel_private._require_help_manage();
  delete from counsel.help_items where id = p_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
end
$$;

-- 한 칸 옮기기: 이웃과 자리 번호를 맞바꾼다. 맨 끝이면 그대로
create function counsel.rpc_move_help_item(p_id uuid, p_dir integer) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pos integer;
  v_other uuid;
  v_other_pos integer;
begin
  perform counsel_private._require_help_manage();
  perform pg_advisory_xact_lock(hashtext('counsel_help_order'));
  select position into v_pos from counsel.help_items where id = p_id;
  if v_pos is null then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  if p_dir < 0 then
    select id, position into v_other, v_other_pos from counsel.help_items where position < v_pos order by position desc limit 1;
  else
    select id, position into v_other, v_other_pos from counsel.help_items where position > v_pos order by position asc limit 1;
  end if;
  if v_other is null then
    return;
  end if;
  -- 유일 색인을 피해 잠시 빈 자리(-1)를 거친다
  update counsel.help_items set position = -1 where id = p_id;
  update counsel.help_items set position = v_pos where id = v_other;
  update counsel.help_items set position = v_other_pos, updated_at = counsel_private._now(), updated_by = auth.uid() where id = p_id;
end
$$;

create function counsel.rpc_save_help_contact(p_contact_md text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform counsel_private._require_help_manage();
  begin
    -- 한 줄짜리 표지만 WHERE 없는 UPDATE 는 Supabase 가 막는다(pg_safeupdate)
    update counsel.help_settings set contact_md = btrim(coalesce(p_contact_md, '')), updated_at = counsel_private._now(), updated_by = auth.uid()
    where id;
  exception
    when check_violation then raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
end
$$;

-- 서랍 연결 통로 ③ 도움말. 숨기지 않은 질문만 순서대로 + 문의처
create function counsel.rpc_seorap_help() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'question', question, 'answer_md', answer_md, 'buttons', buttons) order by position)
                       from counsel.help_items where not hidden), '[]'::jsonb),
    'contact_md', coalesce((select contact_md from counsel.help_settings), '')
  )
$$;

revoke all on function counsel.rpc_seorap_help() from public, anon, authenticated;
grant execute on function counsel.rpc_seorap_help() to service_role;
grant execute on function counsel.rpc_save_help_item(uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function counsel.rpc_delete_help_item(uuid) to authenticated;
grant execute on function counsel.rpc_move_help_item(uuid, integer) to authenticated;
grant execute on function counsel.rpc_save_help_contact(text) to authenticated;

-- 처음 값: 서랍 copy.ko.ts 의 지금 도움말과 문의처 그대로 (배포 직후 화면이 지금과 같게)
insert into counsel.help_settings (contact_md) values ('[자리] 문의: 인싸이트 스토어 톡톡 (평일 10~17시)');
insert into counsel.help_items (position, question, answer_md) values
  (1, '문자가 안 와요', '스팸 문자함을 먼저 확인해 주세요. 1분 뒤에 새 인증번호를 받을 수 있어요. 그래도 오지 않으면 문의해 주세요'),
  (2, '링크를 잃어버렸어요', '구매하고 받은 알림톡을 다시 열어 주세요. 알림톡이 없으면 주문번호와 함께 문의해 주시면 다시 보내 드려요'),
  (3, '취소하고 싶어요', '네이버 스토어 주문 내역에서 취소를 요청해 주세요. 시작하지 않은 검사만 취소할 수 있고, 패키지 상품은 일부만 취소할 수 없어요'),
  (4, '결과는 어디서 보나요', '검사를 마친 뒤 서랍에서 [결과 보기]를 누르면 인싸이트 결과 화면으로 가요'),
  (5, '이런 문자는 서랍이 보내지 않아요', '서랍은 인증번호와 검사 링크만 보내요. 계좌·카드 번호를 묻거나 앱 설치를 권하는 문자는 서랍이 보낸 것이 아니에요');
