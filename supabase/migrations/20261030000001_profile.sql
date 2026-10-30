-- 설정 화면 (10-30 검수): 닉네임. 검사를 전달할 때 받는 분 화면·알림톡에 보이는 보낸 사람 이름.
-- 비어 있으면 지금처럼 가린 실명(name_masked)을 쓴다. 글자 규칙은 _shared/core/nickname.ts 가 정하고, 여기서는 길이만 한 번 더 막는다
alter table app.recipients add column nickname text
  check (nickname is null or char_length(nickname) between 1 and 12);

-- 받는 분 화면의 보낸 사람 이름: 닉네임이 있으면 닉네임 (반환 모양은 그대로라 권한도 그대로)
create or replace function app.forward_link_peek(p_token_hash text)
returns table (out_status text, out_test_name text, out_sender_masked text, out_launched boolean)
language sql stable set search_path = app, public as $$
  select app.forward_link_status(l, v), v.test_name, coalesce(r.nickname, r.name_masked), l.first_launched_at is not null
    from app.access_links l
    join app.vouchers v on v.id = l.voucher_id
    join app.orders o on o.id = v.order_id
    join app.recipients r on r.id = o.recipient_id
   where l.token_hash = p_token_hash and l.link_type = 'forward';
$$;
