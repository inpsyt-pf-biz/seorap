-- 구매 건의 검사 실시 현황. 구매자 아래에 구매한 검사를 한 줄씩 둔다(응시자가 구매자·가족 누구든).
-- 실시 상태는 서랍 검사 코드(app.vouchers.exam_status)에서, 응시자 이름·결과지 주소는 인싸이트 검사결과 API에서 채운다.
-- 묶는 기준: 같은 네이버 결제(주문번호)로 함께 산 검사는 그 결제의 상담 구매 건 아래에 모은다.
-- 지금은 연동 전이라 시드가 가짜 값을 넣는다. 화면은 읽기만 하고, 쓰기는 연동 전용 함수 하나로만 한다.

create table counsel.purchase_tests (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references counsel.purchases (id),
  -- 연동 쪽 줄 번호(서랍 검사 코드 id 등). 같은 줄이 다시 와도 한 줄만 남는다
  source_ref text not null unique check (char_length(source_ref) <= 100),
  naver_product_order_id text check (char_length(naver_product_order_id) <= 40),
  test_name text not null check (char_length(test_name) between 1 and 100),
  unit_no integer check (unit_no > 0),
  -- 서랍과 같은 값: unused 미실시 / in_progress 실시 중(응시를 시작했지만 끝내지 않음) / completed 실시 완료 / deleted 삭제됨
  exam_status text not null default 'unused' check (exam_status in ('unused', 'in_progress', 'completed', 'deleted')),
  exam_started_at timestamptz,
  exam_completed_at timestamptz,
  -- 인싸이트 검사결과 API 값(연결 전에는 비어 있다)
  respondent_name text check (char_length(respondent_name) <= 50),
  result_url text check (char_length(result_url) <= 1000 and result_url ~ '^https://'),
  synced_at timestamptz not null default counsel_private._now(),
  created_at timestamptz not null default counsel_private._now()
);
create index purchase_tests_purchase on counsel.purchase_tests (purchase_id);

alter table counsel.purchase_tests enable row level security;
alter table counsel.purchase_tests force row level security;
create policy purchase_tests_read on counsel.purchase_tests for select to authenticated using ((select counsel_private.is_hq()));
grant select on counsel.purchase_tests to authenticated;

-- 검사 실시 현황 받기(연동 전용, service_role 만). 한 줄 = 검사 1개.
-- 붙일 구매 건: 같은 상품주문번호의 구매 건이 있으면 그 건(검사가 상담 상품 안에 들어 있는 패키지),
-- 없으면 같은 네이버 주문번호(한 번 결제)의 상담 구매 건 가운데 취소·반품되지 않은 건을 먼저, 그다음 상품주문번호가 작은 건.
-- (한 결제의 구매 건들은 같은 수집에서 함께 생겨 생긴 시각이 같으므로 시각으로는 가르지 않는다.) 둘 다 없으면 건너뛰고 수를 돌려준다.
-- 같은 source_ref 가 다시 오면 상태·일시·이름·결과지를 새 값으로 고친다. 한 줄이라도 잘못되면 전체를 되돌린다.
create function counsel.rpc_sync_purchase_tests(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  v_index integer := 0;
  v_pid uuid;
  v_upserted integer := 0;
  v_unmatched integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'rows must be an array';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      v_pid := null;
      select o.purchase_id into v_pid from counsel.naver_product_orders o
      where o.naver_product_order_id = r->>'naver_product_order_id';
      if v_pid is null then
        select o.purchase_id into v_pid from counsel.naver_product_orders o
        where o.external_order_id = r->>'naver_order_id'
        order by coalesce(o.product_order_status in ('CANCELED', 'RETURNED', 'CANCELED_BY_NOPAYMENT'), false), o.naver_product_order_id
        limit 1;
      end if;
      if v_pid is null then
        v_unmatched := v_unmatched + 1;
        continue;
      end if;
      insert into counsel.purchase_tests (
        purchase_id, source_ref, naver_product_order_id, test_name, unit_no, exam_status, exam_started_at, exam_completed_at,
        respondent_name, result_url, synced_at
      ) values (
        v_pid, r->>'source_ref', counsel_private._blank_to_null(r->>'naver_product_order_id'), btrim(r->>'test_name'),
        (r->>'unit_no')::integer, coalesce(r->>'exam_status', 'unused'), (r->>'exam_started_at')::timestamptz,
        (r->>'exam_completed_at')::timestamptz, counsel_private._blank_to_null(r->>'respondent_name'),
        counsel_private._blank_to_null(r->>'result_url'), counsel_private._now()
      )
      on conflict (source_ref) do update set
        purchase_id = excluded.purchase_id, naver_product_order_id = excluded.naver_product_order_id,
        test_name = excluded.test_name, unit_no = excluded.unit_no, exam_status = excluded.exam_status,
        exam_started_at = excluded.exam_started_at, exam_completed_at = excluded.exam_completed_at,
        respondent_name = excluded.respondent_name, result_url = excluded.result_url, synced_at = excluded.synced_at;
      v_upserted := v_upserted + 1;
    exception
      -- data_exception 은 형식·범위·시간대 오류(22로 시작하는 오류)를 모두 묶는다
      when data_exception or check_violation or not_null_violation then
        raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'row ' || v_index || ': ' || sqlerrm;
    end;
  end loop;
  return jsonb_build_object('upserted', v_upserted, 'unmatched', v_unmatched);
end
$$;

revoke execute on all functions in schema counsel from public;
grant execute on function counsel.rpc_sync_purchase_tests(jsonb) to service_role;
