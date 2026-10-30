-- 서랍 도움말 순서 바꾸기를 끌어 놓기로 (10-30 건우님: ↑↓ 단추 대신 드래그 앤 드롭)
-- 화면이 본 순서 전체를 한 번에 저장한다. 그사이 다른 관리자가 질문을 더하거나 지웠으면(화면이 본 묶음과 지금 묶음이 다름)
-- VERSION_CONFLICT 로 거절하고, 화면은 목록을 다시 읽는다. 한 칸씩 옮기던 rpc_move_help_item 은 지운다

drop function counsel.rpc_move_help_item(uuid, integer);

create function counsel.rpc_reorder_help_items(p_ids uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform counsel_private._require_help_manage();
  -- 새 질문(맨 끝 자리)과 같은 자물쇠로 한 줄로 세운다
  perform pg_advisory_xact_lock(hashtext('counsel_help_order'));
  if p_ids is null
     or cardinality(p_ids) <> (select count(*) from counsel.help_items)
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or exists (select 1 from counsel.help_items h where not (h.id = any (p_ids))) then
    raise exception using errcode = 'P0001', message = 'COUNSEL:VERSION_CONFLICT';
  end if;
  -- 유일 색인을 피해 모두 음수 자리로 잠시 옮긴 뒤 1부터 다시 매긴다
  update counsel.help_items set position = -position where position > 0;
  update counsel.help_items h set position = o.ord, updated_at = counsel_private._now(), updated_by = auth.uid()
  from unnest(p_ids) with ordinality as o (id, ord)
  where h.id = o.id;
end
$$;

grant execute on function counsel.rpc_reorder_help_items(uuid[]) to authenticated;
