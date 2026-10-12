-- 네이버 상품주문 칸. 기준은 커머스API '상품 주문 상세 내역 조회' 응답(문서 v2.90.1, 2026-10-12).
-- 구매 건(purchases)에는 출처와 무관한 공통 칸만 두고, 네이버 값은 구매 건 1건당 1줄인 곁 표에 둔다(신청서를 나눈 것과 같은 방식).
-- 칸 이름은 서랍 app.order_items 와 맞췄다. 응답 원본 전체 보관은 연동 쪽 설계에서 따로 정한다.
-- 네이버 코드값(주문 상태·클레임 등)에는 CHECK 를 걸지 않는다. 네이버가 코드를 새로 만들어도 수집이 멈추지 않게 하고, 화면은 모르는 코드를 그대로 보인다.

-- 관리자만 정산 예정 금액·수수료를 본다
insert into counsel.role_caps (member_role, cap) values ('hq_admin', 'settlement.view');

-- 1) 구매 건: 출처 'naver', 구분 미정(null = 미분류), 결제일(날짜) → 결제 일시
alter table counsel.purchases drop constraint purchases_source_check;
alter table counsel.purchases add constraint purchases_source_check check (source in ('manual', 'sheet_import', 'naver'));
alter table counsel.purchases alter column purchase_type drop not null;
alter table counsel.purchases add column paid_at timestamptz;
update counsel.purchases set paid_at = paid_on::timestamp at time zone 'Asia/Seoul' where paid_on is not null;

-- 2) 네이버 상품주문 (구매 건 1 : 1)
create table counsel.naver_product_orders (
  purchase_id uuid primary key references counsel.purchases (id),
  naver_product_order_id text not null unique check (naver_product_order_id ~ '^[0-9]{1,40}$'),
  external_order_id text check (char_length(external_order_id) <= 40),
  ordered_at timestamptz,
  naver_product_id text check (char_length(naver_product_id) <= 40),
  original_product_id text check (char_length(original_product_id) <= 40),
  item_no text check (char_length(item_no) <= 40),
  seller_product_code text check (char_length(seller_product_code) <= 100),
  option_name text check (char_length(option_name) <= 500),
  quantity integer check (quantity >= 0),
  remain_quantity integer check (remain_quantity >= 0),
  payment_amount integer check (payment_amount >= 0),
  remain_payment_amount integer check (remain_payment_amount >= 0),
  product_order_status text check (char_length(product_order_status) <= 40),
  claim_type text check (char_length(claim_type) <= 40),
  claim_status text check (char_length(claim_status) <= 40),
  claim_requested_at timestamptz,
  place_order_status text check (char_length(place_order_status) <= 40),
  decided_at timestamptz,
  gift_receiving_status text check (char_length(gift_receiving_status) <= 40),
  inflow_path text check (char_length(inflow_path) <= 200),
  -- 처음 받을 때 상품 목록표에서 정한 1단위당 상담 횟수. 목록표가 나중에 바뀌어도 이 주문은 이 값을 쓴다
  sessions_per_unit integer not null default 1 check (sessions_per_unit between 1 and 20),
  -- 거래 종료(구매 확정·취소 완료·반품 완료·미결제 취소) 시각. 주문자 정보 파기 기준
  closed_at timestamptz,
  -- 예약 확정 이후에 취소·반품이 들어와 사람이 센터와 확인해야 하는 건
  needs_review boolean not null default false,
  review_reason text check (char_length(review_reason) <= 200),
  last_received_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default counsel_private._now(),
  updated_at timestamptz not null default counsel_private._now()
);
create trigger naver_product_orders_touch before update on counsel.naver_product_orders
  for each row execute function counsel_private.touch_version();
create index naver_product_orders_external on counsel.naver_product_orders (external_order_id);

-- 기존 '주문번호' 칸은 주문번호인지 상품주문번호인지 정해져 있지 않았다. 짐작해서 옮기지 않고 관리자 메모에 남긴다.
update counsel.purchases set admin_memo = concat_ws(E'\n', admin_memo, '[이전 주문번호] ' || order_no)
  where order_no is not null;

drop function counsel.rpc_create_purchase(text, text, text, text, text, date, text, text, jsonb);
drop index counsel.purchases_order_no_unique;
alter table counsel.purchases drop column order_no;
alter table counsel.purchases drop column paid_on;

-- 3) 주문자 (본사만). 원문 이름·연락처는 연동 쪽에서 암호화해 넘기고, 화면에는 가린 값만 열어 준다.
create table counsel.naver_orderers (
  purchase_id uuid primary key references counsel.purchases (id),
  name_enc text,
  name_masked text check (char_length(name_masked) <= 50),
  tel_enc text,
  tel_masked text check (char_length(tel_masked) <= 30),
  -- 신청서 연락처와 짝을 맞출 때 쓰는 값(숫자만 남긴 번호의 HMAC)
  tel_hash text,
  -- 같은 구매자인지 볼 때 쓰는 값(네이버 주문자 번호의 HMAC)
  orderer_no_hash text,
  created_at timestamptz not null default counsel_private._now(),
  updated_at timestamptz not null default counsel_private._now()
);
create index naver_orderers_tel_hash on counsel.naver_orderers (tel_hash);

-- 4) 정산 예정 금액·수수료 (관리자만)
create table counsel.naver_settlements (
  purchase_id uuid primary key references counsel.purchases (id),
  expected_settlement_amount integer,
  payment_commission integer,
  channel_commission integer,
  sale_commission integer,
  shopping_interlock_commission integer,
  updated_at timestamptz not null default counsel_private._now()
);

-- 5) 네이버 상품 → 구매 구분. 옵션번호까지 맞는 줄이 상품번호만 맞는 줄보다 먼저다. 표에 없으면 미분류로 들어온다.
create table counsel.naver_product_types (
  id uuid primary key default gen_random_uuid(),
  naver_product_id text not null check (char_length(naver_product_id) <= 40),
  item_no text check (char_length(item_no) <= 40),
  purchase_type text not null check (purchase_type in ('test_main', 'counsel_main', 'sponsored', 'group_buy')),
  sessions_per_unit integer not null default 1 check (sessions_per_unit between 1 and 20),
  label text check (char_length(label) <= 200),
  enabled boolean not null default true,
  created_at timestamptz not null default counsel_private._now()
);
create unique index naver_product_types_key on counsel.naver_product_types (naver_product_id, coalesce(item_no, ''));

alter table counsel.naver_product_orders enable row level security;
alter table counsel.naver_product_orders force row level security;
alter table counsel.naver_orderers enable row level security;
alter table counsel.naver_orderers force row level security;
alter table counsel.naver_settlements enable row level security;
alter table counsel.naver_settlements force row level security;
alter table counsel.naver_product_types enable row level security;
alter table counsel.naver_product_types force row level security;

create policy naver_product_orders_read on counsel.naver_product_orders for select to authenticated using ((select counsel_private.is_hq()));
create policy naver_orderers_read on counsel.naver_orderers for select to authenticated using ((select counsel_private.is_hq()));
create policy naver_settlements_read on counsel.naver_settlements for select to authenticated using ((select counsel_private.has_cap('settlement.view')));
create policy naver_product_types_read on counsel.naver_product_types for select to authenticated using ((select counsel_private.is_hq()));

grant select on counsel.naver_product_orders, counsel.naver_settlements, counsel.naver_product_types to authenticated;
-- 암호문·짝 맞춤 값은 화면으로 나가지 않는다
grant select (purchase_id, name_masked, tel_masked, created_at, updated_at) on counsel.naver_orderers to authenticated;

-- 상품 목록표에서 구분과 1단위당 상담 횟수를 찾는다
create function counsel_private._naver_type(p_product_id text, p_item_no text)
returns table (purchase_type text, sessions_per_unit integer)
language sql stable set search_path = ''
as $$
  select t.purchase_type, t.sessions_per_unit
  from counsel.naver_product_types t
  where t.enabled and t.naver_product_id = p_product_id and (t.item_no = p_item_no or t.item_no is null)
  order by (t.item_no is null)
  limit 1
$$;

-- 구매 건 직접 등록. 상품주문번호를 적어 두면 나중에 같은 주문이 네이버에서 들어와도 새로 만들지 않고 이 건을 채운다.
create function counsel.rpc_create_purchase(
  p_purchase_type text,
  p_naver_product_order_id text,
  p_product_name text,
  p_test_option text,
  p_counsel_option text,
  p_paid_at timestamptz,
  p_purchase_memo text,
  p_admin_memo text,
  p_application jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_session uuid;
  v_order text := counsel_private._blank_to_null(p_naver_product_order_id);
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  if p_purchase_type is null then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'purchase_type required';
  end if;
  begin
    insert into counsel.purchases (
      purchase_type, product_name, test_option, counsel_option, paid_at, purchase_memo, admin_memo, source, created_by, updated_by
    ) values (
      p_purchase_type, counsel_private._blank_to_null(p_product_name), counsel_private._blank_to_null(p_test_option),
      counsel_private._blank_to_null(p_counsel_option), p_paid_at, counsel_private._blank_to_null(p_purchase_memo),
      counsel_private._blank_to_null(p_admin_memo), 'manual', auth.uid(), auth.uid()
    ) returning id into v_id;
    if v_order is not null then
      insert into counsel.naver_product_orders (purchase_id, naver_product_order_id) values (v_id, v_order);
    end if;
    perform counsel_private._insert_application(v_id, p_application);
    insert into counsel.sessions (purchase_id, seq, updated_by) values (v_id, 1, auth.uid()) returning id into v_session;
    insert into counsel.session_events (session_id, actor, kind, to_status) values (v_session, auth.uid(), 'created', 'unassigned');
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'COUNSEL:DUPLICATE_ORDER';
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = sqlerrm;
  end;
  return v_id;
end
$$;

-- 미분류(또는 잘못 분류된) 구매 건의 구분을 사람이 정한다
create function counsel.rpc_set_purchase_type(p_purchase_id uuid, p_version integer, p_purchase_type text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_version integer;
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  if p_purchase_type is null or p_purchase_type not in ('test_main', 'counsel_main', 'sponsored', 'group_buy') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'purchase_type';
  end if;
  update counsel.purchases set purchase_type = p_purchase_type, updated_by = auth.uid()
  where id = p_purchase_id and version = p_version
  returning version into v_version;
  if v_version is null then
    if exists (select 1 from counsel.purchases where id = p_purchase_id) then
      raise exception using errcode = 'P0001', message = 'COUNSEL:VERSION_CONFLICT';
    end if;
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
  return v_version;
end
$$;

-- '확인 필요' 표시를 사람이 센터와 확인한 뒤 내린다
create function counsel.rpc_resolve_naver_review(p_purchase_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not counsel_private.has_cap('purchase.manage') then
    raise exception using errcode = 'P0001', message = 'COUNSEL:FORBIDDEN';
  end if;
  update counsel.naver_product_orders set needs_review = false, review_reason = null
  where purchase_id = p_purchase_id and needs_review;
  if not found then
    raise exception using errcode = 'P0001', message = 'COUNSEL:NOT_FOUND';
  end if;
end
$$;

-- 네이버 상품주문 받기(연동 프로그램 전용, service_role 만 실행). 한 줄 = 상품주문 1건.
-- 줄 모양은 core/naverIntake.ts 의 NaverIntakeRow: { naver, purchase, orderer?, settlement? }.
-- 같은 주문은 여러 번 온다(네이버는 조회 구간을 겹쳐 부르라고 권한다). 그래서 다시 와도 결과가 같아야 한다.
-- 처음 오는 상품주문번호: 구매 건 + 상담 줄(수량 × 1단위당 횟수, 미배정)을 만든다. 1단위당 횟수는 이때 정해 두고 계속 쓴다.
-- 직접 등록해 둔 번호가 처음 오면: 그 건을 채우고, 모자란 상담 줄을 더한다.
-- 이미 받은 번호: 네이버 칸을 새 값으로 고치고, 구매 건은 빈 공통 칸이 채워질 때만 고친다(사람이 쓴 값 우선).
-- 취소·반품은 처음 받을 때와, 남은 수량이 줄거나 주문이 취소·반품으로 바뀐 때만 반영한다.
--   남은 수량 × 1단위당 횟수만큼만 남기고, 넘치는 줄은 뒤 회차부터 미배정·예약 요청이면 취소, 그 밖이면 '확인 필요'.
-- 거래 종료 시각은 처음 정해진 값을 지킨다(다시 받을 때마다 미뤄지면 61일 파기가 늦어진다).
-- 한 줄이라도 잘못되면 전체를 되돌린다.
create function counsel.rpc_intake_naver_product_orders(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  n jsonb;
  v_index integer := 0;
  v_order text;
  v_pid uuid;
  v_type text;
  v_map_per integer;
  v_per integer;
  v_qty integer;
  v_have integer;
  v_keep integer;
  v_first boolean;
  v_closed_now boolean;
  v_flag boolean;
  v_old_status text;
  v_old_remain integer;
  v_old_received timestamptz;
  v_old_per integer;
  v_session uuid;
  s record;
  v_created integer := 0;
  v_updated integer := 0;
  v_cancelled integer := 0;
  v_review integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'rows must be an array';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      n := r->'naver';
      v_order := n->>'naver_product_order_id';
      if v_order is null then
        raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'row ' || v_index || ': naver_product_order_id';
      end if;
      -- 같은 번호를 두 수집이 동시에 받아도 하나씩 처리한다
      perform pg_advisory_xact_lock(hashtext('counsel:naver:' || v_order));
      select t.purchase_type, t.sessions_per_unit into v_type, v_map_per
        from counsel_private._naver_type(n->>'naver_product_id', n->>'item_no') t;
      v_qty := greatest(coalesce((n->>'quantity')::integer, 1), 1);

      v_pid := null;
      select o.purchase_id, o.product_order_status, o.remain_quantity, o.last_received_at, o.sessions_per_unit
        into v_pid, v_old_status, v_old_remain, v_old_received, v_old_per
        from counsel.naver_product_orders o where o.naver_product_order_id = v_order for update;

      if v_pid is null then
        v_per := coalesce(v_map_per, 1);
        insert into counsel.purchases (purchase_type, product_name, paid_at, purchase_memo, source, source_ref)
        values (
          v_type, counsel_private._blank_to_null(r->'purchase'->>'product_name'), (r->'purchase'->>'paid_at')::timestamptz,
          counsel_private._blank_to_null(r->'purchase'->>'purchase_memo'), 'naver', 'naver:' || v_order
        ) returning id into v_pid;
        insert into counsel.naver_product_orders (purchase_id, naver_product_order_id, sessions_per_unit) values (v_pid, v_order, v_per);
        v_have := 0;
        v_first := true;
        v_created := v_created + 1;
      else
        v_first := v_old_received is null;
        v_per := case when v_first then coalesce(v_map_per, 1) else v_old_per end;
        if v_first then
          update counsel.naver_product_orders set sessions_per_unit = v_per where purchase_id = v_pid;
        end if;
        select coalesce(max(x.seq), 0) into v_have from counsel.sessions x where x.purchase_id = v_pid;
        update counsel.purchases p set
          product_name = coalesce(p.product_name, counsel_private._blank_to_null(r->'purchase'->>'product_name')),
          paid_at = coalesce(p.paid_at, (r->'purchase'->>'paid_at')::timestamptz),
          purchase_memo = coalesce(p.purchase_memo, counsel_private._blank_to_null(r->'purchase'->>'purchase_memo')),
          purchase_type = coalesce(p.purchase_type, v_type)
        where p.id = v_pid and (
          (p.product_name is null and counsel_private._blank_to_null(r->'purchase'->>'product_name') is not null)
          or (p.paid_at is null and r->'purchase'->>'paid_at' is not null)
          or (p.purchase_memo is null and counsel_private._blank_to_null(r->'purchase'->>'purchase_memo') is not null)
          or (p.purchase_type is null and v_type is not null)
        );
        v_updated := v_updated + 1;
      end if;

      -- 처음 받는 번호면 수량 × 1단위당 횟수까지 상담 줄을 채운다
      if v_first then
        for i in v_have + 1 .. v_qty * v_per loop
          insert into counsel.sessions (purchase_id, seq) values (v_pid, i) returning id into v_session;
          insert into counsel.session_events (session_id, kind, to_status, note) values (v_session, 'imported', 'unassigned', '네이버 주문');
        end loop;
      end if;

      update counsel.naver_product_orders o set
        external_order_id = n->>'external_order_id',
        ordered_at = (n->>'ordered_at')::timestamptz,
        naver_product_id = n->>'naver_product_id',
        original_product_id = n->>'original_product_id',
        item_no = n->>'item_no',
        seller_product_code = n->>'seller_product_code',
        option_name = n->>'option_name',
        quantity = (n->>'quantity')::integer,
        remain_quantity = (n->>'remain_quantity')::integer,
        payment_amount = (n->>'payment_amount')::integer,
        remain_payment_amount = (n->>'remain_payment_amount')::integer,
        product_order_status = n->>'product_order_status',
        claim_type = n->>'claim_type',
        claim_status = n->>'claim_status',
        claim_requested_at = (n->>'claim_requested_at')::timestamptz,
        place_order_status = n->>'place_order_status',
        decided_at = (n->>'decided_at')::timestamptz,
        gift_receiving_status = n->>'gift_receiving_status',
        inflow_path = n->>'inflow_path',
        closed_at = case when n->>'closed_at' is null then null else coalesce(o.closed_at, (n->>'closed_at')::timestamptz) end,
        last_received_at = counsel_private._now()
      where o.purchase_id = v_pid;

      if jsonb_typeof(r->'orderer') = 'object' then
        insert into counsel.naver_orderers (purchase_id, name_enc, name_masked, tel_enc, tel_masked, tel_hash, orderer_no_hash)
        values (v_pid, r->'orderer'->>'name_enc', r->'orderer'->>'name_masked', r->'orderer'->>'tel_enc',
          r->'orderer'->>'tel_masked', r->'orderer'->>'tel_hash', r->'orderer'->>'orderer_no_hash')
        on conflict (purchase_id) do update set
          name_enc = excluded.name_enc, name_masked = excluded.name_masked, tel_enc = excluded.tel_enc,
          tel_masked = excluded.tel_masked, tel_hash = excluded.tel_hash, orderer_no_hash = excluded.orderer_no_hash,
          updated_at = counsel_private._now();
      end if;
      if jsonb_typeof(r->'settlement') = 'object' then
        insert into counsel.naver_settlements (purchase_id, expected_settlement_amount, payment_commission, channel_commission, sale_commission, shopping_interlock_commission)
        values (v_pid, (r->'settlement'->>'expected_settlement_amount')::integer, (r->'settlement'->>'payment_commission')::integer,
          (r->'settlement'->>'channel_commission')::integer, (r->'settlement'->>'sale_commission')::integer,
          (r->'settlement'->>'shopping_interlock_commission')::integer)
        on conflict (purchase_id) do update set
          expected_settlement_amount = excluded.expected_settlement_amount, payment_commission = excluded.payment_commission,
          channel_commission = excluded.channel_commission, sale_commission = excluded.sale_commission,
          shopping_interlock_commission = excluded.shopping_interlock_commission, updated_at = counsel_private._now();
      end if;

      -- 남길 상담 줄 수. 주문이 통째로 취소·반품됐으면 0, 아니면 남은 수량 × 1단위당 횟수
      v_closed_now := coalesce(n->>'product_order_status' in ('CANCELED', 'RETURNED', 'CANCELED_BY_NOPAYMENT'), false);
      v_keep := case
        when v_closed_now then 0
        when n->>'remain_quantity' is not null then (n->>'remain_quantity')::integer * v_per
      end;
      if v_keep is not null and (
        v_first
        or (v_closed_now and coalesce(v_old_status, '') not in ('CANCELED', 'RETURNED', 'CANCELED_BY_NOPAYMENT'))
        or (n->>'remain_quantity')::integer < coalesce(v_old_remain, v_qty)
      ) then
        v_flag := false;
        for s in
          select x.id, x.status from counsel.sessions x
          where x.purchase_id = v_pid and x.status <> 'cancelled'
          order by x.seq
          offset v_keep
        loop
          if s.status in ('unassigned', 'requested') then
            update counsel.sessions set status = 'cancelled' where id = s.id;
            insert into counsel.session_events (session_id, kind, from_status, to_status, note)
            values (s.id, 'status_changed', s.status, 'cancelled', '네이버 취소·반품');
            v_cancelled := v_cancelled + 1;
          else
            v_flag := true;
          end if;
        end loop;
        if v_flag then
          update counsel.naver_product_orders set needs_review = true, review_reason = '예약 확정 이후 취소·반품. 센터와 확인 필요'
          where purchase_id = v_pid;
          v_review := v_review + 1;
        end if;
      end if;
    exception
      when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format
        or datetime_field_overflow or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'COUNSEL:INVALID_INPUT', detail = 'row ' || v_index || ': ' || sqlerrm;
    end;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'cancelled_sessions', v_cancelled, 'needs_review', v_review);
end
$$;

-- 거래 종료 61일이 지난 주문자 정보를 지운다(네이버가 같은 시점부터 가린다). 운영에서는 매일 한 번 돌린다.
create function counsel.rpc_purge_naver_orderers() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from counsel.naver_orderers o
  using counsel.naver_product_orders n
  where n.purchase_id = o.purchase_id and n.closed_at < counsel_private._now() - interval '61 days';
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke execute on all functions in schema counsel from public;
revoke execute on all functions in schema counsel_private from public;
grant execute on function counsel.rpc_create_purchase(text, text, text, text, text, timestamptz, text, text, jsonb) to authenticated;
grant execute on function counsel.rpc_set_purchase_type(uuid, integer, text) to authenticated;
grant execute on function counsel.rpc_resolve_naver_review(uuid) to authenticated;
-- 연동 프로그램(service_role)만 부른다. 로그인한 직원은 부르지 못한다.
grant usage on schema counsel to service_role;
grant execute on function counsel.rpc_intake_naver_product_orders(jsonb) to service_role;
grant execute on function counsel.rpc_purge_naver_orderers() to service_role;
