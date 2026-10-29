-- 서랍 입장 PIN (build-spec §4-2a, 10-28). 서랍 주인(수취인)마다 하나.
-- pin_hash 는 crypto.ts hashPin 결과(v1.salt.hash)이고 원문은 어디에도 남기지 않는다.
alter table app.recipients
  add column pin_hash text,
  add column pin_set_at timestamptz,
  add column pin_failed_count int not null default 0,
  add column pin_locked_at timestamptz;

-- PIN 시도 한 번을 먼저 센다. 비교 전에 세야 동시에 여러 번 넣어도 한도(p_max)를 넘지 못한다.
-- 잠겼거나 PIN 이 없으면 행이 없다. 맞으면 pin_success 가 횟수와 잠금을 되돌린다.
create function app.pin_try(p_recipient_id uuid, p_max int)
returns table (out_failed_count int, out_locked boolean, out_pin_hash text)
language sql set search_path = app, public as $$
  update app.recipients
     set pin_failed_count = pin_failed_count + 1,
         pin_locked_at = case when pin_failed_count + 1 >= p_max then now() else pin_locked_at end
   where id = p_recipient_id and pin_hash is not null and pin_locked_at is null
  returning pin_failed_count, pin_locked_at is not null, pin_hash;
$$;

create function app.pin_success(p_recipient_id uuid)
returns void
language sql set search_path = app, public as $$
  update app.recipients set pin_failed_count = 0, pin_locked_at = null where id = p_recipient_id;
$$;

revoke all on function app.pin_try(uuid, int) from public, anon, authenticated;
revoke all on function app.pin_success(uuid) from public, anon, authenticated;
grant execute on function app.pin_try(uuid, int) to service_role;
grant execute on function app.pin_success(uuid) to service_role;
