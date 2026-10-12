# 백로그

나중에 할 일. 착수할 때 다시 분석·설계를 거친다.

| # | 등록일 | 할 일 | 내용 | 바뀌는 곳 |
|---|---|---|---|---|
| B1 | 2026-10-12 | 로그인 실패 안내 문구 구분 | 지금은 로그인 서버(로컬 Supabase)가 꺼져 있어도 "이메일 또는 비밀번호가 맞지 않아요"가 뜬다. 연결 실패일 때는 "로그인 서버에 연결할 수 없어요. DB가 켜져 있는지 확인해 주세요(deno task db:start)"로 나눠 안내한다 | `web/src/shell/SessionProvider.tsx`(실패 이유 구분), `web/src/pages/LoginPage.tsx`, `core/copy.ko.ts` |
