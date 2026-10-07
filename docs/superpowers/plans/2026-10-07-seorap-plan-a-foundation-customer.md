# 서랍 Plan A: 기반 + 고객 핵심 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 Supabase 위에서 수취인이 링크 → OTP → 서랍(1매 = 1줄) → 실시하기·전달하기·다시 보내기·다른 분께·직접 공유 → 전달 이력까지 끝까지 쓸 수 있게 하고, 같은 구성을 미리보기 환경(Vercel + Supabase `seorap-preview`)에 올린다. build-spec 마일스톤 M0~M2에 해당한다.

**Architecture:** 화면은 Vite + React SPA(`web/`), 서버 일은 Supabase Edge Function **하나**(`api`, 내부 라우터)가 맡는다. 화면은 언제나 같은 주소의 `/api/*`를 부르고, 로컬에서는 Vite 프록시가, 배포에서는 `vercel.json` rewrites가 `/functions/v1/api/*`로 넘긴다. 순수 규칙(번호 정규화, 1매 줄 상태, 전달 한도, 문구, 시간)은 `supabase/functions/_shared/core/`에 두고 화면과 함수가 같이 import한다. 여러 행을 한 번에 바꾸는 일(OTP 시도, 전달)은 Postgres 함수(RPC)로 원자적으로 처리한다.

**Tech Stack:** Vite 8, React 19, MUI 9, React Router 7, TypeScript 6(strict), Supabase CLI 2.107(로컬 Docker), Postgres 17, Deno 2.4(Edge Functions·테스트), `@supabase/supabase-js@2`, `jsr:@std/assert@1`, Vitest(화면 단위 테스트).

**Spec:** `C:/Users/김건우/Desktop/VS/Works-archive/projects/2026-10-01-naver-voucher-box/build-spec.md` (10-07 승인). 테이블 정본은 같은 폴더 `launch-plan.md` §5. 이 계획이 명세와 다르게 정한 것은 맨 아래 "명세와 달라진 점"에 모았다.

**계획 묶음:** Plan A(이 문서, M0~M2) → Plan B(받는 분 1매 화면·상담·도움말, M3) → Plan C(어드민, M4) → Plan D(연동 워커·가짜 어댑터 통합·E2E·운영 배포 준비, M5). B~D는 A가 끝난 뒤 따로 쓴다. 명세 §12의 "OTP 행 24시간·세션 만료 후 7일 정리 작업"은 연동 워커가 맡으므로 **Plan D**에 넣는다(Plan A 기간에는 로컬·미리보기 데이터라 쌓여도 문제없다).

## Global Constraints

- 모든 코드 TypeScript strict. 한글은 실제 글자로 쓰고 `\uXXXX` 이스케이프 금지
- **사용자에게 보이는 문장은 `supabase/functions/_shared/core/copy.ko.ts` 한 곳에서만** 꺼낸다(`t(key, vars)`). 화면·함수 코드에 문장을 직접 쓰지 않는다
- 화면: MUI `Typography variant`로만 글자 크기를 정한다(인라인 `fontSize` 금지). 색은 `web/src/theme/seorap.ts`의 토큰으로만. 포인트 컬러 `#D4664B`는 로고·큰 제목·그림에만, 버튼은 인싸이트 남색 `#2B398F`
- 본문 16px, 보조 14px, 캡션 12px 미만 금지. 터치 영역 44px 이상. 폭 360px에서 가로 스크롤 없음
- 토큰 형식: 영문 대소문자·숫자 **32자** (`/^[A-Za-z0-9]{32}$/`). 토큰·OTP·세션 ID 원문은 DB와 로그에 남기지 않는다(HMAC-SHA256만 저장)
- 이름·번호·코드는 AES-GCM 암호문(텍스트 `v1.<iv base64>.<ct base64>`)으로 저장한다. 키: A(이름·번호), B(코드). HMAC 키 1개. 모두 환경변수
- 번호는 `normalizePhone()` 하나로만 다룬다. 번호 해시는 `hmac('phone:' + 정규화번호)`
- 코드 원문은 실시하기·코드 보기를 누르기 전에는 어떤 응답에도 넣지 않는다
- 고객 세션 쿠키 `seorap_sid`: HttpOnly · SameSite=Lax · Path=/ · Secure(로컬만 끔). 휴대폰 무활동 60분·최대 24시간, PC 무활동 30분
- 로컬 Supabase 포트는 **55321번대**(Booth가 54321번대를 쓴다)
- `dev_outbox`(가짜 문자·알림톡 보관함)는 `SEORAP_ENV`가 `production`이면 쓰지도 읽지도 않는다. `/dev/outbox` 화면도 운영 빌드에 없다
- 시각 표시·하루 경계는 Asia/Seoul(UTC+9). 구매일은 `orders.paid_at`
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **새 OTP를 받으면 이전 번호는 통하지 않아야 한다.** 사람은 문자 두 통 중 아무거나 넣는다. 가장 최근 번호만 받는다 → Task 11 `otp_old_code_rejected` 테스트
2. **자정 직후(00:30 KST) 주문의 구매일이 전날로 보이면 안 된다** → Task 4 `formatKstDate` 00:30 테스트
3. **세션이 끝난 채로 버튼을 누르면 앱이 깨지지 않고 "다시 인증" 화면이 떠야 한다** → Task 12 `expired_session_returns_401`, Task 16 BoxPage 처리
4. **번호를 붙여넣는 형식은 제각각이다**(`+82 10-…`, 공백, 하이픈 없음, 유선번호) → Task 2 `normalizePhone` 테스트
5. **다른 사람의 발송권 ID로 부르면 거부해야 하고, 존재 여부도 드러내면 안 된다** → Task 13 `not_owner_and_unknown_look_same` 테스트

---

## 파일 구조

```
seorap/
  deno.json                         # 루트 Deno 설정: import map, 작업(task)
  scripts/
    gen-keys.ts                     # 암호화·HMAC 키 생성
    local-env.sh                    # 로컬 Supabase 접속값을 SEED_* 로 내보냄
    seed.ts                         # 시드 시나리오 8개 (로컬·미리보기 전용)
  supabase/
    config.toml                     # 포트 55321번대, app 스키마 노출, api 함수 JWT 검사 끔
    migrations/
      20261007000001_core.sql       # 설정·수취인·주문·상품매핑·발급·발송권
      20261007000002_access.sql     # 링크·OTP·세션·전달 이력·메시지·이벤트·dev_outbox
      20261007000003_rpc.sql        # 원자 처리 함수(OTP 실패, 노출 기록, 전달, 한도 집계)
    functions/
      .env                          # (커밋 안 함) 로컬 함수 비밀값
      _shared/
        core/                       # 순수 TS. 화면과 함수가 같이 쓴다
          phone.ts  time.ts  copy.ko.ts  lineStatus.ts  limits.ts  apiTypes.ts  (+ *.test.ts)
        crypto.ts                   # HMAC·AES-GCM·토큰 (Deno)
        crypto.test.ts
        adapters/
          types.ts                  # 문자·알림톡 어댑터 인터페이스
          mock.ts                   # 가짜 구현 (dev_outbox에 기록)
      api/
        deno.json                   # 배포 번들용 import map
        index.ts                    # Deno.serve
        router.ts                   # 경로 → 처리기
        lib/
          http.ts  db.ts  settings.ts  session.ts  links.ts  events.ts  ownership.ts  box.ts  messages.ts
        handlers/
          entry.ts  otp.ts  box.ts  history.ts  voucher.ts  forward.ts  dev.ts  logout.ts
  tests/api/                        # Deno 통합 테스트 (로컬 함수에 HTTP)
    helpers.ts  entry_otp.test.ts  box.test.ts  voucher.test.ts  forward.test.ts
  web/
    vite.config.ts                  # @core 별칭, /api 프록시, vitest
    src/
      lib/api.ts  lib/useCountdown.ts
      components/Wordmark.tsx  LineRow.tsx  ForwardSheet.tsx  ConfirmDialog.tsx
      pages/EntryPage.tsx  BoxPage.tsx  HistoryPage.tsx  StatePage.tsx  DevOutboxPage.tsx  Placeholder.tsx
      App.tsx
```

---

### Task 1: 로컬 Supabase·Deno·화면 개발 환경

**Files:**
- Create: `supabase/config.toml` (supabase init으로 생성 후 수정), `deno.json`, `supabase/functions/api/deno.json`, `scripts/gen-keys.ts`, `scripts/local-env.sh`, `supabase/functions/.env`
- Modify: `.gitignore`, `web/vite.config.ts`, `web/tsconfig.app.json`, `web/package.json`

**Interfaces:**
- Produces: 로컬 API `http://127.0.0.1:55321`, 함수 경로 `/functions/v1/api/*`, 화면 별칭 `@core/*` → `supabase/functions/_shared/core/*`, Deno 작업 `test:core`, `test:api`, `db:reset`, `fn:serve`

- [ ] **Step 1: supabase init**

Run (저장소 루트): `supabase init --force` (이미 있는 `supabase/.temp`는 그대로 둔다. VS Code·IntelliJ 질문이 나오면 N)
Expected: `supabase/config.toml` 생성

- [ ] **Step 2: config.toml 수정**

`supabase/config.toml`에서 아래 값만 바꾼다(나머지는 그대로).

```toml
project_id = "seorap"

[api]
port = 55321
schemas = ["public", "graphql_public", "app"]
extra_search_path = ["public", "extensions"]

[db]
port = 55322
shadow_port = 55320

[db.pooler]
port = 55329

[studio]
port = 55323

[inbucket]
port = 55324

[analytics]
enabled = false
port = 55327

[edge_runtime]
inspector_port = 55383

[functions.api]
verify_jwt = false
```

- [ ] **Step 3: .gitignore에 비밀 파일 추가**

`.gitignore` 끝에 추가:

```gitignore
supabase/functions/.env
.secrets/
web/coverage/
```

- [ ] **Step 4: 루트 deno.json**

```json
{
  "imports": {
    "@std/assert": "jsr:@std/assert@1",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2"
  },
  "tasks": {
    "test:core": "deno test --allow-env supabase/functions/_shared",
    "fn:serve": "supabase functions serve api --env-file supabase/functions/.env --no-verify-jwt",
    "db:reset": "bash -c 'supabase db reset && source scripts/local-env.sh && deno run -A scripts/seed.ts'",
    "test:api": "bash -c 'source scripts/local-env.sh && deno test -A tests/api'"
  },
  "exclude": ["web/"]
}
```

- [ ] **Step 5: 함수 배포용 deno.json**

`supabase/functions/api/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 6: 키 생성 스크립트**

`scripts/gen-keys.ts`:

```ts
// 서랍 비밀값 생성. 출력은 .env 형식. 로컬·미리보기·운영 각각 따로 만든다.
// 운영 키는 잃어버리면 암호문을 되살릴 수 없으므로 비밀번호 관리 도구에 보관한다.
function key(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const env = Deno.args[0] ?? 'local'
console.log(`SEORAP_ENV=${env}`)
console.log(`SEORAP_HMAC_KEY=${key()}`)
console.log(`SEORAP_ENC_KEY_A=${key()}`)
console.log(`SEORAP_ENC_KEY_B=${key()}`)
```

- [ ] **Step 7: 로컬 함수 비밀값 파일**

Run: `deno run scripts/gen-keys.ts local > supabase/functions/.env`
그다음 같은 파일 끝에 직접 추가:

```
SEORAP_COOKIE_SECURE=false
SEORAP_PUBLIC_BASE=http://localhost:5173
SEORAP_PLATFORM_TEST_URL=https://inpsyt.co.kr/inpsyt/testing
```

- [ ] **Step 8: 로컬 접속값 스크립트**

`scripts/local-env.sh`:

```bash
#!/usr/bin/env bash
# 로컬 Supabase 접속값을 SEED_* 환경변수로 내보낸다. 값을 화면에 출력하지 않는다.
while IFS='=' read -r k v; do
  v="${v%$'\r'}"; v="${v%\"}"; v="${v#\"}"
  case "$k" in
    API_URL) export SEED_SUPABASE_URL="$v" ;;
    SERVICE_ROLE_KEY) export SEED_SERVICE_ROLE_KEY="$v" ;;
  esac
done < <(supabase status -o env 2>/dev/null)
export SEED_KEYS_FILE="${SEED_KEYS_FILE:-supabase/functions/.env}"
```

- [ ] **Step 9: 화면 설정 (별칭·프록시·테스트)**

Run (web 폴더): `npm install -D vitest@^4 jsdom @testing-library/react @testing-library/user-event`
(설치 중 Vite 8과 버전 충돌 경고가 나면 `npm view vitest version`으로 최신을 확인해 그 버전으로 다시 설치한다)

`web/vite.config.ts` 전체:

```ts
/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const core = fileURLToPath(new URL('../supabase/functions/_shared/core', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@core': core } },
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:55321',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '/functions/v1/api'),
      },
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
```

`web/tsconfig.app.json`의 `compilerOptions`에 추가:

```json
"paths": { "@core/*": ["../supabase/functions/_shared/core/*"] }
```

`web/package.json`의 `scripts`에 추가: `"test": "vitest run"`

- [ ] **Step 10: 로컬 Supabase 기동 확인**

Run: `supabase start`
Expected: `API URL: http://127.0.0.1:55321`, `Studio URL: http://127.0.0.1:55323` 출력. Booth 컨테이너(`supabase_*_inpsytorderv2`)는 계속 살아 있어야 한다(`docker ps`로 확인)

- [ ] **Step 11: Commit**

```bash
git add .gitignore deno.json scripts/gen-keys.ts scripts/local-env.sh supabase/config.toml supabase/functions/api/deno.json web/vite.config.ts web/tsconfig.app.json web/package.json web/package-lock.json
git commit -m "chore: 로컬 Supabase(55321번대)·Deno 작업·화면 별칭과 프록시 설정"
```

---

### Task 2: 번호 정규화 `phone.ts`

**Files:**
- Create: `supabase/functions/_shared/core/phone.ts`, `supabase/functions/_shared/core/phone.test.ts`

**Interfaces:**
- Produces: `normalizePhone(input: string): string | null` (숫자 10~11자리, `01[016789]`로 시작), `formatPhone(digits: string): string`, `maskPhone(digits: string): string` (`010-****-5678`), `last4(digits: string): string`, `maskName(name: string): string` (`홍*동`), `formatPhoneInput(raw: string): string` (입력 중 자동 하이픈)

- [ ] **Step 1: 실패하는 테스트**

`supabase/functions/_shared/core/phone.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { formatPhone, formatPhoneInput, last4, maskName, maskPhone, normalizePhone } from './phone.ts'

Deno.test('normalizePhone: 여러 입력 형식', () => {
  assertEquals(normalizePhone('010-1234-5678'), '01012345678')
  assertEquals(normalizePhone('01012345678'), '01012345678')
  assertEquals(normalizePhone(' 010 1234 5678 '), '01012345678')
  assertEquals(normalizePhone('+82 10-1234-5678'), '01012345678')
  assertEquals(normalizePhone('+821012345678'), '01012345678')
  assertEquals(normalizePhone('011-123-4567'), '0111234567')
})

Deno.test('normalizePhone: 휴대폰이 아니면 null', () => {
  assertEquals(normalizePhone('02-123-4567'), null)
  assertEquals(normalizePhone('010-123'), null)
  assertEquals(normalizePhone(''), null)
  assertEquals(normalizePhone('abc'), null)
  assertEquals(normalizePhone('010-1234-56789'), null)
})

Deno.test('formatPhone·maskPhone·last4', () => {
  assertEquals(formatPhone('01012345678'), '010-1234-5678')
  assertEquals(formatPhone('0111234567'), '011-123-4567')
  assertEquals(maskPhone('01012345678'), '010-****-5678')
  assertEquals(last4('01012345678'), '5678')
})

Deno.test('maskName', () => {
  assertEquals(maskName('홍길동'), '홍*동')
  assertEquals(maskName('남궁민수'), '남**수')
  assertEquals(maskName('이몽'), '이*')
  assertEquals(maskName('김'), '김')
  assertEquals(maskName(' 홍길동 '), '홍*동')
})

Deno.test('formatPhoneInput: 입력 중 자동 하이픈', () => {
  assertEquals(formatPhoneInput('010'), '010')
  assertEquals(formatPhoneInput('0101'), '010-1')
  assertEquals(formatPhoneInput('0101234'), '010-1234')
  assertEquals(formatPhoneInput('01012345678'), '010-1234-5678')
  assertEquals(formatPhoneInput('010-1234-567890'), '010-1234-5678')
})
```

- [ ] **Step 2: 실패 확인**

Run: `deno task test:core`
Expected: FAIL (`./phone.ts` 모듈 없음)

- [ ] **Step 3: 구현**

`supabase/functions/_shared/core/phone.ts`:

```ts
// 번호는 이 파일의 함수로만 다룬다 (수집·전달·OTP·번호 변경 공용)
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('82')) d = '0' + d.slice(2)
  if (!/^01[016789]\d{7,8}$/.test(d)) return null
  return d
}

export function formatPhone(d: string): string {
  return d.length === 11
    ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
    : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

export function maskPhone(d: string): string {
  const parts = formatPhone(d).split('-')
  return `${parts[0]}-****-${parts[2]}`
}

export function last4(d: string): string {
  return d.slice(-4)
}

export function maskName(name: string): string {
  const t = name.trim()
  if (t.length <= 1) return t
  if (t.length === 2) return t[0] + '*'
  return t[0] + '*'.repeat(t.length - 2) + t[t.length - 1]
}

export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}
```

- [ ] **Step 4: 통과 확인**

Run: `deno task test:core`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/core/phone.ts supabase/functions/_shared/core/phone.test.ts
git commit -m "feat(core): 번호 정규화·가림·자동 하이픈"
```

---

### Task 3: 문구 사전 `copy.ko.ts`

**Files:**
- Create: `supabase/functions/_shared/core/copy.ko.ts`, `supabase/functions/_shared/core/copy.ko.test.ts`

**Interfaces:**
- Produces: `copy` (키 → 문장), `type CopyKey`, `t(key: CopyKey, vars?: Record<string, string | number>): string` (`{name}` 자리 채움, 없는 변수는 그대로 둔다)

- [ ] **Step 1: 실패하는 테스트**

`supabase/functions/_shared/core/copy.ko.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { copy, t } from './copy.ko.ts'

Deno.test('t: 변수 채우기', () => {
  assertEquals(t('box.title', { name: '홍길동' }), '홍길동님의 서랍')
  assertEquals(t('line.unit', { n: 2, k: 1 }), '2매 중 1번째')
})

Deno.test('t: 없는 변수는 자리 그대로', () => {
  assertEquals(t('box.title'), '{name}님의 서랍')
})

Deno.test('명세 §10 필수 키가 모두 있다', () => {
  const required = [
    'otp.sms', 'entry.title', 'entry.send', 'otp.wrong', 'otp.expired', 'otp.locked',
    'box.title', 'box.group', 'line.unit', 'forward.confirm', 'forward.self', 'forward.night',
    'forward.direct.warn', 'history.line', 'maintenance',
  ]
  for (const k of required) assertEquals(k in copy, true, k)
})

Deno.test('문구에 엠대시가 없다', () => {
  for (const [k, v] of Object.entries(copy)) assertEquals(v.includes('—'), false, k)
})
```

- [ ] **Step 2: 실패 확인**

Run: `deno task test:core`
Expected: FAIL (`./copy.ko.ts` 없음)

- [ ] **Step 3: 구현**

`supabase/functions/_shared/core/copy.ko.ts`:

```ts
// 사용자에게 보이는 문장은 모두 여기서만 꺼낸다. [자리] 표시는 확정 전 임시 문구.
export const copy = {
  'otp.sms': '[인싸이트] 서랍 인증번호 {code} (3분 안에 입력해 주세요)',
  'entry.title': '{name}님의 서랍이에요',
  'entry.send': '{phone}로 인증번호를 보낼게요',
  'entry.button': '인증번호 받기',
  'entry.notice': '[자리] 서랍 이용을 위해 개인정보를 처리해요. 자세한 내용은 개인정보 처리방침에서 볼 수 있어요',
  'otp.title': '인증번호를 입력해 주세요',
  'otp.remaining': '남은 시간 {time}',
  'otp.submit': '확인',
  'otp.resend': '새 번호 받기',
  'otp.noSms': '문자가 안 와요',
  'otp.noSms.help': '스팸 문자함을 확인해 주세요. 1분 뒤에 새 번호를 받을 수 있어요',
  'otp.wrong': '번호가 맞지 않아요. {n}번 더 틀리면 잠시 잠겨요',
  'otp.expired': '시간이 지났어요. 새 번호를 받아 주세요',
  'otp.locked': '여러 번 틀려서 잠겼어요. {time}에 다시 시도하거나 문의해 주세요',
  'otp.rateLimited': '잠시 후 다시 시도해 주세요. {time}부터 받을 수 있어요',
  'box.title': '{name}님의 서랍',
  'box.summary': '실시 전 {n}매',
  'box.tab.mine': '내 검사',
  'box.tab.history': '전달 이력',
  'box.group': '{date} 구매 · {product} · {n}매로 나눠 보여 드려요',
  'box.groupSingle': '{date} 구매 · {product}',
  'box.empty': '최근 12개월 동안 구매한 검사가 없어요',
  'box.logout': '로그아웃',
  'line.unit': '{n}매 중 {k}번째',
  'line.cancelled': '취소됨',
  'line.cancelChecking': '취소 확인 중',
  'line.preparing': '준비 중',
  'line.unusable': '사용할 수 없는 검사예요',
  'line.counselLocked': '신청서 제출 후 열려요',
  'line.checking': '확인 중',
  'line.completed': '완료',
  'line.inProgress': '응시 중',
  'line.unused': '미사용',
  'line.launched': '실시함 ({date})',
  'line.forwarded': '전달함 · {name}',
  'line.forwardOpened': '받는 분이 열어 봄',
  'line.forwardNotOpened': '아직 안 열어 봄',
  'line.notStarted': '실시 전',
  'line.cancelRejected': '취소할 수 없어요: {reason}',
  'action.launch': '실시하기',
  'action.continue': '이어서 하기',
  'action.forward': '전달하기',
  'action.resend': '다시 보내기',
  'action.reforward': '다른 분께',
  'action.contact': '문의하기',
  'action.counsel_form': '신청서 쓰기',
  'action.result_help': '결과 보는 법',
  'action.code': '코드 보기',
  'launch.choose': '이어서 할까요, 새 1매를 쓸까요?',
  'launch.continue': '이어서 하기',
  'launch.new': '새 1매 쓰기',
  'code.title': '검사 코드',
  'code.pcNote': 'PC에서는 인싸이트 사이트에서 코드를 입력해 주세요',
  'common.close': '닫기',
  'common.cancel': '취소',
  'common.confirm': '확인',
  'forward.title': '{test} 전달하기',
  'forward.name': '이름 또는 호칭',
  'forward.phone': '휴대폰 번호',
  'forward.child': '만 14세 미만이면 보호자 번호로 보내 주세요',
  'forward.night': '지금 보내면 밤에 알림이 갈 수 있어요',
  'forward.next': '다음',
  'forward.confirm': '이 번호가 맞나요?',
  'forward.send': '보내기',
  'forward.edit': '고치기',
  'forward.self': '본인 번호예요. 직접 실시하시겠어요?',
  'forward.selfSend': '그래도 보내기',
  'forward.more': '더보기',
  'forward.direct': '번호 없이 링크 복사하기',
  'forward.direct.warn': '직접 공유하면 받는 분이 기록되지 않아요',
  'forward.direct.copied': '링크를 복사했어요. 원하는 곳에 붙여넣어 주세요',
  'forward.direct.text': '[인싸이트 서랍] {sender}님이 심리검사를 보냈어요. {url}',
  'forward.sent': '{name}님께 보냈어요',
  'forward.resend.confirm': '{name}님께 다시 보낼까요?',
  'forward.reforward.confirm': '{name}님께 보낸 링크는 더 이상 열리지 않아요. 다른 분께 보낼까요?',
  'forward.exposed': '받는 분이 이미 코드를 확인해서 바꿀 수 없어요. 문의해 주세요',
  'forward.invalidName': '이름 또는 호칭을 1~20자로 입력해 주세요',
  'forward.invalidPhone': '휴대폰 번호를 확인해 주세요 (예: 010-1234-5678)',
  'limit.per_voucher_day': '이 검사는 오늘 더 보낼 수 없어요. {time}부터 다시 보낼 수 있어요',
  'limit.same_number_gap': '같은 번호로는 {time}부터 다시 보낼 수 있어요',
  'limit.per_box_day': '오늘은 더 보낼 수 없어요. {time}부터 다시 보낼 수 있어요',
  'history.line': '{name} / {phone} 님께 {at} 검사링크 전달 · {result}',
  'history.direct': '{at} 링크 직접 공유 · 받는 분 미확인',
  'history.cancel': '{at} {name}님께 보낸 전달을 취소함',
  'history.resendMark': '다시 보내기',
  'history.result.delivered_alimtalk': '알림톡 전달 완료',
  'history.result.delivered_sms': '문자로 전달 완료',
  'history.result.sending': '보내는 중',
  'history.result.failed': '전달 실패',
  'history.opened': '받는 분이 열어 봄',
  'history.empty': '아직 전달한 검사가 없어요',
  'state.linkInvalid': '링크가 맞지 않아요. 받은 알림톡의 링크를 다시 눌러 주세요',
  'state.linkRevoked': '이 링크는 더 이상 열 수 없어요. 보낸 분께 다시 요청해 주세요',
  'state.sessionExpired': '다시 인증해 주세요. 받은 알림톡의 링크를 다시 눌러 주세요',
  'state.notFound': '찾는 화면이 없어요',
  'state.blocked': '확인이 필요한 서랍이에요. 문의해 주세요',
  'maintenance': '확인 후 순서대로 보내 드려요. 급하시면 톡톡으로 문의해 주세요',
  'error.generic': '잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요',
  'placeholder.preparing': '서비스를 준비하고 있어요.',
  'brand.parent': '인싸이트',
  'brand.name': '서랍',
} as const

export type CopyKey = keyof typeof copy

export function t(key: CopyKey, vars: Record<string, string | number> = {}): string {
  return copy[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `deno task test:core`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/core/copy.ko.ts supabase/functions/_shared/core/copy.ko.test.ts
git commit -m "feat(core): 문구 사전과 t()"
```

---

### Task 4: 서울 시각 도구 `time.ts`

**Files:**
- Create: `supabase/functions/_shared/core/time.ts`, `supabase/functions/_shared/core/time.test.ts`

**Interfaces:**
- Produces: `formatKstDate(iso: string): string` (`2026-10-23`), `formatKstMonthDay(iso: string): string` (`10-23`), `formatKstDateTime(iso: string): string` (`2026-10-23 00:30`), `isNightKst(d: Date): boolean` (21~08시), `kstDayStart(d: Date): Date`, `nextKstMidnight(d: Date): Date`

- [ ] **Step 1: 실패하는 테스트**

`supabase/functions/_shared/core/time.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { formatKstDate, formatKstDateTime, formatKstMonthDay, isNightKst, kstDayStart, nextKstMidnight } from './time.ts'

Deno.test('자정 직후 주문의 구매일 (Review Focus 2)', () => {
  // 2026-10-22T15:30Z = 서울 10-23 00:30
  assertEquals(formatKstDate('2026-10-22T15:30:00Z'), '2026-10-23')
  assertEquals(formatKstDateTime('2026-10-22T15:30:00Z'), '2026-10-23 00:30')
  assertEquals(formatKstMonthDay('2026-10-22T15:30:00Z'), '10-23')
})

Deno.test('밤 시간 판정 21~08시', () => {
  assertEquals(isNightKst(new Date('2026-10-22T12:00:00Z')), true)   // 21:00
  assertEquals(isNightKst(new Date('2026-10-22T22:59:00Z')), true)   // 07:59
  assertEquals(isNightKst(new Date('2026-10-22T23:00:00Z')), false)  // 08:00
  assertEquals(isNightKst(new Date('2026-10-22T05:00:00Z')), false)  // 14:00
})

Deno.test('하루 시작과 다음 자정', () => {
  const d = new Date('2026-10-22T05:00:00Z') // 서울 14:00
  assertEquals(kstDayStart(d).toISOString(), '2026-10-21T15:00:00.000Z')
  assertEquals(nextKstMidnight(d).toISOString(), '2026-10-22T15:00:00.000Z')
})
```

- [ ] **Step 2: 실패 확인**

Run: `deno task test:core` → FAIL (`./time.ts` 없음)

- [ ] **Step 3: 구현**

`supabase/functions/_shared/core/time.ts`:

```ts
const KST_MS = 9 * 60 * 60 * 1000
const p2 = (n: number) => String(n).padStart(2, '0')

function kst(d: Date) {
  const k = new Date(d.getTime() + KST_MS)
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), mi: k.getUTCMinutes() }
}

export function formatKstDate(iso: string): string {
  const x = kst(new Date(iso))
  return `${x.y}-${p2(x.m)}-${p2(x.d)}`
}

export function formatKstMonthDay(iso: string): string {
  const x = kst(new Date(iso))
  return `${p2(x.m)}-${p2(x.d)}`
}

export function formatKstDateTime(iso: string): string {
  const x = kst(new Date(iso))
  return `${x.y}-${p2(x.m)}-${p2(x.d)} ${p2(x.h)}:${p2(x.mi)}`
}

export function isNightKst(d: Date): boolean {
  const h = kst(d).h
  return h >= 21 || h < 8
}

export function kstDayStart(d: Date): Date {
  const x = kst(d)
  return new Date(Date.UTC(x.y, x.m - 1, x.d) - KST_MS)
}

export function nextKstMidnight(d: Date): Date {
  const x = kst(d)
  return new Date(Date.UTC(x.y, x.m - 1, x.d + 1) - KST_MS)
}
```

- [ ] **Step 4: 통과 확인** — `deno task test:core` → PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/core/time.ts supabase/functions/_shared/core/time.test.ts
git commit -m "feat(core): 서울 시각 표시·하루 경계"
```

---

### Task 5: 1매 줄 상태 규칙 `lineStatus.ts`

**Files:**
- Create: `supabase/functions/_shared/core/lineStatus.ts`, `supabase/functions/_shared/core/lineStatus.test.ts`

**Interfaces:**
- Consumes: `t` (Task 3), `formatKstMonthDay` (Task 4)
- Produces:

```ts
export type LineAction = 'launch' | 'continue' | 'forward' | 'resend' | 'reforward' | 'contact' | 'counsel_form' | 'result_help'
export type LineTone = 'neutral' | 'info' | 'success' | 'warning' | 'muted'
export type LineStatus = { label: string; tone: LineTone; actions: LineAction[]; note?: string }
export type LineInput = {
  issueStatus: 'pending' | 'issued' | 'failed' | 'voided' | 'replaced'
  cancelStatus: 'none' | 'checking' | 'cancelled' | 'rejected'
  cancelRejectReason: string | null
  examStatus: null | 'unused' | 'in_progress' | 'completed' | 'deleted'
  examStatusEnabled: boolean
  lockReasons: string[]
  firstLaunchedAt: string | null
  platformDeletedAt: string | null
  forward: null | { displayName: string; openedAt: string | null; codeExposed: boolean }
}
export function lineStatus(i: LineInput): LineStatus
```

- [ ] **Step 1: 실패하는 테스트**

`supabase/functions/_shared/core/lineStatus.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { type LineInput, lineStatus } from './lineStatus.ts'

const base: LineInput = {
  issueStatus: 'issued', cancelStatus: 'none', cancelRejectReason: null, examStatus: null,
  examStatusEnabled: false, lockReasons: [], firstLaunchedAt: null, platformDeletedAt: null, forward: null,
}
const s = (o: Partial<LineInput>) => lineStatus({ ...base, ...o })

Deno.test('1 취소됨', () => assertEquals(s({ cancelStatus: 'cancelled' }), { label: '취소됨', tone: 'muted', actions: [] }))
Deno.test('2 취소 확인 중', () => assertEquals(s({ cancelStatus: 'checking' }).label, '취소 확인 중'))
Deno.test('3 준비 중 (발급 전·실패)', () => {
  assertEquals(s({ issueStatus: 'pending' }).label, '준비 중')
  assertEquals(s({ issueStatus: 'failed' }).actions, [])
})
Deno.test('4 사용할 수 없음 (폐기)', () => {
  assertEquals(s({ issueStatus: 'voided' }).actions, ['contact'])
  assertEquals(s({ platformDeletedAt: '2026-10-22T00:00:00Z' }).label, '사용할 수 없는 검사예요')
})
Deno.test('5 상담 신청서 잠금', () => assertEquals(s({ lockReasons: ['counsel_pending'] }), { label: '신청서 제출 후 열려요', tone: 'info', actions: ['counsel_form'] }))
Deno.test('6 그 밖 잠금, 여러 개 겹쳐도 상담이 먼저', () => {
  assertEquals(s({ lockReasons: ['admin_hold'] }).label, '확인 중')
  assertEquals(s({ lockReasons: ['admin_hold', 'counsel_pending'] }).label, '신청서 제출 후 열려요')
})
Deno.test('7~9 응시상태는 꺼져 있으면 무시', () => {
  assertEquals(s({ examStatus: 'completed' }).label, '실시 전')
  assertEquals(s({ examStatus: 'completed', examStatusEnabled: true }).label, '완료')
  assertEquals(s({ examStatus: 'in_progress', examStatusEnabled: true }).actions, ['continue'])
})
Deno.test('10 실시함', () => assertEquals(s({ firstLaunchedAt: '2026-10-22T15:30:00Z' }), { label: '실시함 (10-23)', tone: 'info', actions: ['continue'] }))
Deno.test('11 전달함, 코드 노출 전에는 다른 분께 가능', () => {
  const r = s({ forward: { displayName: '홍길동', openedAt: null, codeExposed: false } })
  assertEquals(r.label, '전달함 · 홍길동')
  assertEquals(r.actions, ['resend', 'reforward'])
  assertEquals(r.note, '아직 안 열어 봄')
})
Deno.test('11 전달함, 코드 노출 후에는 다른 분께 숨김', () => {
  const r = s({ forward: { displayName: '홍길동', openedAt: '2026-10-22T01:00:00Z', codeExposed: true } })
  assertEquals(r.actions, ['resend'])
  assertEquals(r.note, '받는 분이 열어 봄')
})
Deno.test('12 실시 전', () => assertEquals(s({}), { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] }))
Deno.test('취소 거부 사유는 note로', () => {
  const r = s({ cancelStatus: 'rejected', cancelRejectReason: '이미 실시한 검사예요' })
  assertEquals(r.label, '실시 전')
  assertEquals(r.note, '취소할 수 없어요: 이미 실시한 검사예요')
})
```

- [ ] **Step 2: 실패 확인** — `deno task test:core` → FAIL

- [ ] **Step 3: 구현**

`supabase/functions/_shared/core/lineStatus.ts`:

```ts
import { t } from './copy.ko.ts'
import { formatKstMonthDay } from './time.ts'

export type LineAction = 'launch' | 'continue' | 'forward' | 'resend' | 'reforward' | 'contact' | 'counsel_form' | 'result_help'
export type LineTone = 'neutral' | 'info' | 'success' | 'warning' | 'muted'
export type LineStatus = { label: string; tone: LineTone; actions: LineAction[]; note?: string }
export type LineInput = {
  issueStatus: 'pending' | 'issued' | 'failed' | 'voided' | 'replaced'
  cancelStatus: 'none' | 'checking' | 'cancelled' | 'rejected'
  cancelRejectReason: string | null
  examStatus: null | 'unused' | 'in_progress' | 'completed' | 'deleted'
  examStatusEnabled: boolean
  lockReasons: string[]
  firstLaunchedAt: string | null
  platformDeletedAt: string | null
  forward: null | { displayName: string; openedAt: string | null; codeExposed: boolean }
}

// build-spec §5. 순위가 높은 조건이 먼저 이긴다.
function core(i: LineInput): LineStatus {
  if (i.cancelStatus === 'cancelled') return { label: t('line.cancelled'), tone: 'muted', actions: [] }
  if (i.cancelStatus === 'checking') return { label: t('line.cancelChecking'), tone: 'warning', actions: [] }
  if (i.issueStatus === 'pending' || i.issueStatus === 'failed') return { label: t('line.preparing'), tone: 'muted', actions: [] }
  if (i.issueStatus === 'voided' || i.platformDeletedAt || i.examStatus === 'deleted') {
    return { label: t('line.unusable'), tone: 'muted', actions: ['contact'] }
  }
  if (i.lockReasons.includes('counsel_pending')) return { label: t('line.counselLocked'), tone: 'info', actions: ['counsel_form'] }
  if (i.lockReasons.length > 0) return { label: t('line.checking'), tone: 'warning', actions: ['contact'] }
  if (i.examStatusEnabled && i.examStatus === 'completed') return { label: t('line.completed'), tone: 'success', actions: ['result_help'] }
  if (i.examStatusEnabled && i.examStatus === 'in_progress') return { label: t('line.inProgress'), tone: 'info', actions: ['continue'] }
  if (i.firstLaunchedAt) return { label: t('line.launched', { date: formatKstMonthDay(i.firstLaunchedAt) }), tone: 'info', actions: ['continue'] }
  if (i.forward) {
    return {
      label: t('line.forwarded', { name: i.forward.displayName }),
      tone: 'info',
      actions: i.forward.codeExposed ? ['resend'] : ['resend', 'reforward'],
      note: i.forward.openedAt ? t('line.forwardOpened') : t('line.forwardNotOpened'),
    }
  }
  if (i.examStatusEnabled && i.examStatus === 'unused') return { label: t('line.unused'), tone: 'neutral', actions: ['launch', 'forward'] }
  return { label: t('line.notStarted'), tone: 'neutral', actions: ['launch', 'forward'] }
}

export function lineStatus(i: LineInput): LineStatus {
  const r = core(i)
  if (i.cancelStatus === 'rejected' && i.cancelRejectReason) {
    const reject = t('line.cancelRejected', { reason: i.cancelRejectReason })
    return { ...r, note: r.note ? `${r.note} · ${reject}` : reject }
  }
  return r
}
```

- [ ] **Step 4: 통과 확인** — `deno task test:core` → PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/core/lineStatus.ts supabase/functions/_shared/core/lineStatus.test.ts
git commit -m "feat(core): 1매 줄 상태 규칙 (명세 §5)"
```

---

### Task 6: 전달 한도 `limits.ts` + 응답 타입 `apiTypes.ts`

**Files:**
- Create: `supabase/functions/_shared/core/limits.ts`, `supabase/functions/_shared/core/limits.test.ts`, `supabase/functions/_shared/core/apiTypes.ts`

**Interfaces:**
- Consumes: `nextKstMidnight` (Task 4), `LineStatus` (Task 5)
- Produces:

```ts
export type ForwardLimitInput = { now: Date; voucherToday: number; boxToday: number; lastSameNumberAt: Date | null; unusedCount: number;
  settings: { perVoucherDay: number; sameNumberGapMin: number; perBoxDayMin: number } }
export type LimitResult = { ok: true } | { ok: false; reason: 'per_voucher_day' | 'same_number_gap' | 'per_box_day'; retryAt: Date }
export function checkForwardLimits(i: ForwardLimitInput): LimitResult
```
그리고 `apiTypes.ts`의 응답 타입 전부(아래 Step 3).

- [ ] **Step 1: 실패하는 테스트**

`supabase/functions/_shared/core/limits.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { checkForwardLimits } from './limits.ts'

const now = new Date('2026-10-22T05:00:00Z') // 서울 14:00
const settings = { perVoucherDay: 3, sameNumberGapMin: 10, perBoxDayMin: 20 }
const base = { now, voucherToday: 0, boxToday: 0, lastSameNumberAt: null, unusedCount: 3, settings }

Deno.test('한도 안이면 통과', () => assertEquals(checkForwardLimits(base), { ok: true }))
Deno.test('1매당 하루 3회', () => {
  assertEquals(checkForwardLimits({ ...base, voucherToday: 3 }), { ok: false, reason: 'per_voucher_day', retryAt: new Date('2026-10-22T15:00:00Z') })
})
Deno.test('같은 번호 10분 간격', () => {
  const r = checkForwardLimits({ ...base, lastSameNumberAt: new Date('2026-10-22T04:55:00Z') })
  assertEquals(r, { ok: false, reason: 'same_number_gap', retryAt: new Date('2026-10-22T05:05:00Z') })
})
Deno.test('10분 지나면 통과', () => {
  assertEquals(checkForwardLimits({ ...base, lastSameNumberAt: new Date('2026-10-22T04:49:00Z') }), { ok: true })
})
Deno.test('서랍당 하루 max(20, 미사용 매수)', () => {
  assertEquals(checkForwardLimits({ ...base, boxToday: 20 }).ok, false)
  assertEquals(checkForwardLimits({ ...base, boxToday: 20, unusedCount: 25 }).ok, true)
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`supabase/functions/_shared/core/limits.ts`:

```ts
import { nextKstMidnight } from './time.ts'

export type ForwardLimitInput = {
  now: Date
  voucherToday: number
  boxToday: number
  lastSameNumberAt: Date | null
  unusedCount: number
  settings: { perVoucherDay: number; sameNumberGapMin: number; perBoxDayMin: number }
}
export type LimitResult = { ok: true } | { ok: false; reason: 'per_voucher_day' | 'same_number_gap' | 'per_box_day'; retryAt: Date }

export function checkForwardLimits(i: ForwardLimitInput): LimitResult {
  if (i.voucherToday >= i.settings.perVoucherDay) return { ok: false, reason: 'per_voucher_day', retryAt: nextKstMidnight(i.now) }
  if (i.lastSameNumberAt) {
    const until = new Date(i.lastSameNumberAt.getTime() + i.settings.sameNumberGapMin * 60_000)
    if (until > i.now) return { ok: false, reason: 'same_number_gap', retryAt: until }
  }
  const perBox = Math.max(i.settings.perBoxDayMin, i.unusedCount)
  if (i.boxToday >= perBox) return { ok: false, reason: 'per_box_day', retryAt: nextKstMidnight(i.now) }
  return { ok: true }
}
```

`supabase/functions/_shared/core/apiTypes.ts`:

```ts
import type { LineStatus } from './lineStatus.ts'

export type ErrorCode =
  | 'OTP_WRONG' | 'OTP_EXPIRED' | 'OTP_LOCKED' | 'RATE_LIMITED' | 'LINK_INVALID' | 'LINK_REVOKED'
  | 'SESSION_EXPIRED' | 'REAUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_OWNER' | 'CONFLICT' | 'LIMIT_EXCEEDED'
  | 'VALIDATION' | 'UPSTREAM_FAILED' | 'MAINTENANCE'
export type ApiErrorBody = { error: { code: ErrorCode; extra?: Record<string, unknown> } }

export type EntryResponse = { nameMasked: string; phoneMasked: string; noticeBanner: string | null }
export type OtpRequestResponse = { expiresAt: string; resendAt: string }
export type OtpVerifyResponse = { ok: true }

export type BoxLine = {
  voucherId: string
  testItemId: string
  testName: string
  unitNo: number
  unitsOfTest: number
  status: LineStatus
  firstLaunchedAt: string | null
  forwardTo: { name: string; phone: string } | null
}
export type BoxGroup = { orderId: string; purchasedAt: string; productName: string; lineCount: number; done: boolean; lines: BoxLine[] }
export type BoxResponse = { ownerName: string; notStartedCount: number; noticeBanner: string | null; groups: BoxGroup[] }

export type HistoryResult = 'delivered_alimtalk' | 'delivered_sms' | 'sending' | 'failed'
export type HistoryItem = {
  id: string
  at: string
  action: 'forward' | 'resend' | 'cancel' | 'direct_share'
  testName: string
  unitNo: number
  toName: string | null
  toPhone: string | null
  result: HistoryResult | null
  openedAt: string | null
}
export type HistoryResponse = { items: HistoryItem[] }

export type LaunchResponse = { url: string }
export type CodeResponse = { code: string }
export type ForwardResponse = { forwardId: string; created: boolean }
export type DirectShareResponse = { text: string; url: string }
export type DevOutboxItem = { id: string; createdAt: string; kind: 'sms' | 'alimtalk'; toLast4: string; body: string }
```

- [ ] **Step 4: 통과 확인** — `deno task test:core` → PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/core/limits.ts supabase/functions/_shared/core/limits.test.ts supabase/functions/_shared/core/apiTypes.ts
git commit -m "feat(core): 전달 한도 규칙과 API 응답 타입"
```

---

### Task 7: DB 마이그레이션 1 (핵심 테이블)

**Files:**
- Create: `supabase/migrations/20261007000001_core.sql`

**Interfaces:**
- Produces: 스키마 `app`, 테이블 `settings`, `recipients`, `orders`, `store_products`, `product_mappings`, `product_mapping_items`, `order_items`, `code_issuances`, `vouchers`. 모든 테이블 RLS 켬, `anon`·`authenticated` 접근 없음, `service_role`만 읽기·쓰기

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20261007000001_core.sql`:

```sql
-- 서랍 핵심 테이블 (Plan A). 정본: launch-plan §5. 달라진 점은 계획 문서 끝에 정리.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to service_role;
alter default privileges in schema app grant select, insert, update, delete on tables to service_role;
alter default privileges in schema app grant execute on functions to service_role;

create table app.settings (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table app.recipients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone_enc text not null,
  phone_hash text not null unique,
  phone_last4 text not null,
  name_enc text,
  name_masked text,
  enc_key_version smallint not null default 1,
  first_order_at timestamptz not null,
  last_order_at timestamptz not null,
  last_login_at timestamptz,
  status text not null default 'active' check (status in ('active', 'blocked', 'purged')),
  blocked_reason text,
  purged_at timestamptz,
  updated_at timestamptz not null default now()
);
create index recipients_last_order_idx on app.recipients (last_order_at) where status <> 'purged';

create table app.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('naver_api', 'excel', 'own_pg', 'manual')),
  external_order_id text not null,
  recipient_id uuid not null references app.recipients (id),
  paid_at timestamptz not null,
  ordered_at timestamptz,
  recipient_name_enc text,
  recipient_name_masked text,
  orderer_name_enc text,
  orderer_name_masked text,
  orderer_differs boolean not null default false,
  has_delivery_memo boolean not null default false,
  is_test boolean not null default false,
  link_sent_at timestamptz,
  purged_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (source, external_order_id)
);
create index orders_recipient_paid_idx on app.orders (recipient_id, paid_at desc);

create table app.store_products (
  naver_product_id text primary key,
  kind text not null default 'unknown' check (kind in ('test', 'tool', 'other', 'unknown')),
  product_name text,
  first_seen_at timestamptz not null default now(),
  alerted_at timestamptz,
  updated_by text
);

create table app.product_mappings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key_type text not null check (key_type in ('seller_code', 'product_option')),
  seller_product_code text,
  naver_product_id text,
  original_product_id text,
  option_code text,
  version int not null default 1,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  includes_counsel boolean not null default false,
  is_supplement boolean not null default false,
  enabled boolean not null default true,
  is_test_product boolean not null default false,
  min_amount int,
  created_by text
);

create table app.product_mapping_items (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references app.product_mappings (id),
  psy_item_id text not null,
  sub_component_id text,
  test_name text not null,
  count_per_unit int not null check (count_per_unit > 0),
  respondent text not null default 'self' check (respondent in ('self', 'guardian'))
);

create table app.order_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references app.orders (id),
  naver_product_order_id text not null unique,
  naver_product_id text,
  original_product_id text,
  option_code text,
  seller_product_code text,
  product_name text not null,
  option_name text,
  quantity int not null,
  remain_quantity int,
  payment_amount int not null,
  product_order_status text,
  place_order_status text,
  last_changed_type text,
  last_changed_at timestamptz,
  gift_receiving_status text,
  placed_confirmed_at timestamptz,
  shipping_due_at timestamptz,
  dispatched_at timestamptz,
  dispatch_status text not null default 'none' check (dispatch_status in ('none', 'pending', 'done', 'failed', 'external')),
  dispatch_error_code text,
  mapping_id uuid references app.product_mappings (id),
  handling text not null default 'seorap' check (handling in ('seorap', 'not_target', 'legacy_sent', 'shadow_only', 'test', 'manual_only')),
  process_status text not null default 'awaiting_payment' check (process_status in (
    'awaiting_payment', 'awaiting_gift', 'mapping_pending', 'held_contact', 'held_amount', 'boundary_check',
    'confirming', 'confirm_failed', 'issuing', 'issue_failed', 'issue_unknown', 'partially_issued',
    'link_queued', 'link_sent', 'dispatched', 'manual_required', 'closed_cancelled')),
  hold_reason text,
  last_trace_id text,
  updated_at timestamptz not null default now()
);
create index order_items_order_idx on app.order_items (order_id);

create table app.code_issuances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_item_id uuid not null references app.order_items (id),
  idempotency_key text not null unique,
  reason text not null default 'order' check (reason in ('order', 'reissue', 'manual_entry')),
  status text not null default 'pending' check (status in ('pending', 'in_flight', 'succeeded', 'partial', 'failed', 'unknown')),
  expected_count int not null,
  issued_count int not null default 0,
  attempt_count int not null default 0,
  request_meta jsonb not null default '{}'::jsonb check (not (request_meta ?| array['name', 'phone', 'tel', 'recipient'])),
  response_code text,
  error_code text,
  requested_at timestamptz,
  completed_at timestamptz,
  requested_by text
);

create table app.vouchers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_item_id uuid not null references app.order_items (id),
  order_id uuid not null references app.orders (id),
  issuance_id uuid references app.code_issuances (id),
  issued_via text not null default 'api' check (issued_via in ('api', 'manual')),
  entered_by text,
  test_item_id text not null,
  sub_component_id text,
  test_name text not null,
  unit_no int not null check (unit_no > 0),
  code_enc text,
  code_hash text unique,
  code_valid_until timestamptz,
  issue_status text not null default 'pending' check (issue_status in ('pending', 'issued', 'failed', 'voided', 'replaced')),
  amount int,
  reissued_from_id uuid references app.vouchers (id),
  replaced_by_id uuid references app.vouchers (id),
  first_code_exposed_at timestamptz,
  first_launched_at timestamptz,
  last_launched_at timestamptz,
  launched_by text check (launched_by in ('recipient', 'forward_receiver')),
  exam_status text check (exam_status in ('unused', 'in_progress', 'completed', 'deleted')),
  exam_progress numeric,
  exam_completed_at timestamptz,
  exam_checked_at timestamptz,
  platform_deleted_at timestamptz,
  cancel_status text not null default 'none' check (cancel_status in ('none', 'checking', 'cancelled', 'rejected')),
  lock_reasons text[] not null default '{}' check (lock_reasons <@ array['counsel_pending', 'reported_not_mine', 'phone_change_pending', 'admin_hold']),
  current_forward_id uuid,
  alias text,
  updated_at timestamptz not null default now(),
  unique (order_item_id, test_item_id, unit_no)
);
create index vouchers_order_idx on app.vouchers (order_id);

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'app' loop
    execute format('alter table app.%I enable row level security', r.tablename);
  end loop;
end $$;
```

- [ ] **Step 2: 적용 확인**

Run: `supabase db reset`
Expected: `Finished supabase db reset` (오류 없음). Studio(`http://127.0.0.1:55323`)에서 `app` 스키마에 테이블 9개

- [ ] **Step 3: 제약 확인 (일회성)**

Run: `docker exec supabase_db_seorap psql -U postgres -c "insert into app.code_issuances (order_item_id, idempotency_key, expected_count, request_meta) values (gen_random_uuid(), 'x', 1, '{\"phone\":\"1\"}')"`
Expected: FAIL (`violates check constraint` 또는 외래키 오류). `request_meta`에 개인정보 키가 들어가지 않는지, 외래키가 살아 있는지 확인하는 용도

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261007000001_core.sql
git commit -m "feat(db): 핵심 테이블 (수취인·주문·매핑·발급·발송권)"
```

---

### Task 8: DB 마이그레이션 2 (링크·OTP·세션·전달·메시지)

**Files:**
- Create: `supabase/migrations/20261007000002_access.sql`

**Interfaces:**
- Produces: 테이블 `access_links`(`code_exposed_at` 포함), `otp_challenges`, `customer_sessions`, `voucher_forwards`(추가만), `messages`, `message_events`(추가만), `events`(추가만), `dev_outbox`. 트리거 함수 `app.block_mutation()`. 뷰 `app.v_forward_log`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20261007000002_access.sql`:

```sql
-- 링크·인증·전달·메시지 (Plan A)

create table app.access_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token_hash text not null unique,
  link_type text not null check (link_type in ('box', 'forward')),
  recipient_id uuid references app.recipients (id),
  voucher_id uuid references app.vouchers (id),
  forward_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('reforwarded', 'resent', 'forward_cancelled', 'voucher_cancelled', 'phone_changed', 'reported', 'admin', 'purged')),
  revoked_by text,
  first_opened_at timestamptz,
  code_exposed_at timestamptz,
  first_launched_at timestamptz,
  last_launched_at timestamptz,
  check ((link_type = 'box' and recipient_id is not null and voucher_id is null)
      or (link_type = 'forward' and voucher_id is not null and forward_id is not null)),
  check (link_type <> 'forward' or expires_at is not null)
);
-- 서랍당 살아 있는 링크 1개(A2), 1매당 받는 분 링크 1개
create unique index access_links_one_box on app.access_links (recipient_id) where link_type = 'box' and revoked_at is null;
create unique index access_links_one_forward on app.access_links (voucher_id) where link_type = 'forward' and revoked_at is null;

create table app.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  access_link_id uuid not null references app.access_links (id),
  target_phone_hash text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  locked_until timestamptz,
  consumed_at timestamptz,
  unlocked_by_admin boolean not null default false,
  message_id uuid,
  ip_hash text
);
create index otp_phone_idx on app.otp_challenges (target_phone_hash, created_at);
create index otp_link_idx on app.otp_challenges (access_link_id, created_at);

create table app.customer_sessions (
  id_hash text primary key,
  created_at timestamptz not null default now(),
  scope text not null check (scope in ('box', 'forward')),
  recipient_id uuid references app.recipients (id),
  access_link_id uuid not null references app.access_links (id),
  device_class text not null check (device_class in ('mobile', 'desktop')),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  last_otp_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);

create table app.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vendor_message_key text,
  purpose text not null check (purpose in ('t1_box', 't2_forward', 't3_counsel', 'otp', 'reminder', 'phone_change_notice', 'cancel_notice', 'ops_alert')),
  template_code text,
  template_version int,
  requested_channel text not null check (requested_channel in ('alimtalk', 'sms')),
  to_kind text not null check (to_kind in ('recipient', 'forward_receiver', 'counsel_applicant', 'operator')),
  to_phone_hash text,
  to_phone_last4 text,
  recipient_id uuid references app.recipients (id),
  forward_id uuid,
  otp_id uuid,
  accept_code text,
  accepted_at timestamptz,
  final_status text not null default 'queued' check (final_status in ('queued', 'accepted', 'delivered', 'failed', 'unknown')),
  final_media text check (final_media in ('alimtalk', 'sms', 'lms')),
  fallback_used boolean not null default false,
  final_at timestamptz,
  poll_due_at timestamptz,
  attempt_count int not null default 0,
  purged_at timestamptz
);

create table app.voucher_forwards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  voucher_id uuid not null references app.vouchers (id),
  action text not null check (action in ('forward', 'resend', 'cancel', 'direct_share')),
  resend_of_forward_id uuid references app.voucher_forwards (id),
  actor_type text not null check (actor_type in ('recipient', 'admin')),
  actor_admin_id uuid,
  client_request_id text not null unique,
  delivery_mode text not null check (delivery_mode in ('seorap_message', 'direct_share')),
  to_name_enc text,
  to_name_masked text,
  to_phone_enc text,
  to_phone_hash text,
  to_phone_last4 text,
  is_self_number boolean not null default false,
  message_id uuid,
  access_link_id uuid,
  purged_at timestamptz,
  check (action not in ('direct_share', 'cancel') or to_phone_enc is null),
  check (action not in ('forward', 'resend') or to_phone_enc is not null or purged_at is not null)
);
create index voucher_forwards_voucher_idx on app.voucher_forwards (voucher_id, created_at);
create index voucher_forwards_phone_idx on app.voucher_forwards (to_phone_hash) where purged_at is null;

-- 서로 가리키는 외래키는 트랜잭션 끝에 검사한다 (전달 1건 = 이력·링크·메시지를 한 번에 만든다)
alter table app.access_links add constraint access_links_forward_fk foreign key (forward_id) references app.voucher_forwards (id) deferrable initially deferred;
alter table app.voucher_forwards add constraint voucher_forwards_message_fk foreign key (message_id) references app.messages (id) deferrable initially deferred;
alter table app.voucher_forwards add constraint voucher_forwards_link_fk foreign key (access_link_id) references app.access_links (id) deferrable initially deferred;
alter table app.messages add constraint messages_forward_fk foreign key (forward_id) references app.voucher_forwards (id) deferrable initially deferred;
alter table app.messages add constraint messages_otp_fk foreign key (otp_id) references app.otp_challenges (id) deferrable initially deferred;
alter table app.otp_challenges add constraint otp_message_fk foreign key (message_id) references app.messages (id) deferrable initially deferred;
alter table app.vouchers add constraint vouchers_current_forward_fk foreign key (current_forward_id) references app.voucher_forwards (id) deferrable initially deferred;

create table app.message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references app.messages (id),
  source text not null check (source in ('webhook', 'poll', 'mock')),
  event_type text not null,
  media text,
  result_code text,
  vendor_ids jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create table app.events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  name text not null,
  recipient_id uuid,
  order_id uuid,
  voucher_id uuid,
  session_id_hash text,
  props jsonb not null default '{}'::jsonb,
  ip_hash text,
  ua_class text
);

-- 로컬·미리보기 전용 가짜 발신함. 운영에서는 코드가 쓰지도 읽지도 않는다.
create table app.dev_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('sms', 'alimtalk')),
  to_phone_last4 text not null,
  body text not null
);

-- 추가만 테이블: 수정·삭제·TRUNCATE 차단. 파기 함수만 seorap.purging=on 으로 수정 가능 (Plan C 이후)
create function app.block_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('seorap.purging', true), '') = 'on' then
    return new;
  end if;
  raise exception '% is append-only (%)', tg_table_name, tg_op;
end $$;

create trigger voucher_forwards_append_only before update or delete on app.voucher_forwards for each row execute function app.block_mutation();
create trigger voucher_forwards_no_truncate before truncate on app.voucher_forwards for each statement execute function app.block_mutation();
create trigger message_events_append_only before update or delete on app.message_events for each row execute function app.block_mutation();
create trigger message_events_no_truncate before truncate on app.message_events for each statement execute function app.block_mutation();
create trigger events_append_only before update or delete on app.events for each row execute function app.block_mutation();
create trigger events_no_truncate before truncate on app.events for each statement execute function app.block_mutation();

create view app.v_forward_log with (security_invoker = on) as
select f.id, f.voucher_id, f.action, f.actor_type, f.delivery_mode, f.created_at,
       f.to_name_enc, f.to_name_masked, f.to_phone_enc, f.to_phone_last4, f.purged_at,
       m.final_status, m.final_media, m.fallback_used, m.final_at,
       al.first_opened_at, al.first_launched_at, al.revoked_at, al.revoked_reason
  from app.voucher_forwards f
  left join app.messages m on m.id = f.message_id
  left join app.access_links al on al.id = f.access_link_id;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'app' loop
    execute format('alter table app.%I enable row level security', r.tablename);
  end loop;
end $$;
```

- [ ] **Step 2: 적용** — `supabase db reset` → 오류 없음

- [ ] **Step 3: 추가만 트리거 확인 (일회성)**

Run: `docker exec supabase_db_seorap psql -U postgres -c "truncate app.voucher_forwards"`
Expected: FAIL `voucher_forwards is append-only (TRUNCATE)`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261007000002_access.sql
git commit -m "feat(db): 링크·OTP·세션·전달 이력·메시지 테이블, 추가만 트리거"
```

---

### Task 9: DB 마이그레이션 3 (원자 처리 함수)

**Files:**
- Create: `supabase/migrations/20261007000003_rpc.sql`

**Interfaces:**
- Produces (모두 `app` 스키마, supabase-js `db.rpc(...)`로 호출):
  - `otp_register_failure(p_id uuid, p_lock_minutes int) returns table(out_attempt_count int, out_max_attempts int, out_locked_until timestamptz)`
  - `otp_consume(p_id uuid) returns boolean`
  - `voucher_mark_exposed(p_voucher_id uuid, p_launch boolean) returns void`
  - `forward_counts(p_recipient_id uuid, p_voucher_id uuid, p_to_phone_hash text, p_day_start timestamptz) returns table(out_voucher_today int, out_box_today int, out_last_same_number timestamptz, out_unused int)`
  - `forward_apply(p_action text, p_voucher_id uuid, p_client_request_id text, p_actor_type text, p_token_hash text, p_link_ttl_days int, p_to_name_enc text, p_to_name_masked text, p_to_phone_enc text, p_to_phone_hash text, p_to_phone_last4 text, p_is_self boolean) returns table(out_forward_id uuid, out_message_id uuid, out_access_link_id uuid, out_created boolean)`. 오류: `ALREADY_FORWARDED`, `NO_ACTIVE_FORWARD`, `NOT_RESENDABLE`, `CODE_EXPOSED`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20261007000003_rpc.sql`:

```sql
-- 여러 행을 한 번에 바꾸는 일은 여기서 원자적으로 처리한다 (Plan A)

create function app.otp_register_failure(p_id uuid, p_lock_minutes int)
returns table (out_attempt_count int, out_max_attempts int, out_locked_until timestamptz)
language sql set search_path = app, public as $$
  update app.otp_challenges
     set attempt_count = attempt_count + 1,
         locked_until = case when attempt_count + 1 >= max_attempts then now() + make_interval(mins => p_lock_minutes) else locked_until end
   where id = p_id and consumed_at is null
  returning attempt_count, max_attempts, locked_until;
$$;

create function app.otp_consume(p_id uuid)
returns boolean
language sql set search_path = app, public as $$
  with u as (update app.otp_challenges set consumed_at = now() where id = p_id and consumed_at is null returning id)
  select exists (select 1 from u);
$$;

create function app.voucher_mark_exposed(p_voucher_id uuid, p_launch boolean)
returns void
language sql set search_path = app, public as $$
  update app.vouchers
     set first_code_exposed_at = coalesce(first_code_exposed_at, now()),
         first_launched_at = case when p_launch then coalesce(first_launched_at, now()) else first_launched_at end,
         last_launched_at = case when p_launch then now() else last_launched_at end,
         launched_by = case when p_launch then coalesce(launched_by, 'recipient') else launched_by end,
         updated_at = now()
   where id = p_voucher_id;
$$;

create function app.forward_counts(p_recipient_id uuid, p_voucher_id uuid, p_to_phone_hash text, p_day_start timestamptz)
returns table (out_voucher_today int, out_box_today int, out_last_same_number timestamptz, out_unused int)
language sql stable set search_path = app, public as $$
  with mine as (
    select v.id from app.vouchers v join app.orders o on o.id = v.order_id where o.recipient_id = p_recipient_id
  )
  select
    (select count(*)::int from app.voucher_forwards f
      where f.voucher_id = p_voucher_id and f.action in ('forward', 'resend') and f.created_at >= p_day_start),
    (select count(*)::int from app.voucher_forwards f
      where f.voucher_id in (select id from mine) and f.action in ('forward', 'resend') and f.created_at >= p_day_start),
    (select max(f.created_at) from app.voucher_forwards f
      where f.voucher_id in (select id from mine) and f.to_phone_hash = p_to_phone_hash and f.action in ('forward', 'resend')),
    (select count(*)::int from app.vouchers v
      where v.id in (select id from mine) and v.issue_status = 'issued' and v.cancel_status = 'none'
        and v.first_launched_at is null and v.current_forward_id is null and cardinality(v.lock_reasons) = 0);
$$;

create function app.forward_apply(
  p_action text,
  p_voucher_id uuid,
  p_client_request_id text,
  p_actor_type text,
  p_token_hash text,
  p_link_ttl_days int,
  p_to_name_enc text default null,
  p_to_name_masked text default null,
  p_to_phone_enc text default null,
  p_to_phone_hash text default null,
  p_to_phone_last4 text default null,
  p_is_self boolean default false
)
returns table (out_forward_id uuid, out_message_id uuid, out_access_link_id uuid, out_created boolean)
language plpgsql set search_path = app, public as $$
declare
  v_existing app.voucher_forwards%rowtype;
  v_current app.voucher_forwards%rowtype;
  v_current_link app.access_links%rowtype;
  v_forward_id uuid := gen_random_uuid();
  v_msg_id uuid := null;
  v_link_id uuid := null;
begin
  if p_action not in ('forward', 'resend', 'cancel', 'direct_share') then
    raise exception 'INVALID_ACTION';
  end if;

  -- 같은 요청 ID는 한 번만 처리 (연타)
  select * into v_existing from app.voucher_forwards where client_request_id = p_client_request_id;
  if found then
    return query select v_existing.id, v_existing.message_id, v_existing.access_link_id, false;
    return;
  end if;

  perform 1 from app.vouchers where id = p_voucher_id for update;
  select f.* into v_current from app.vouchers v join app.voucher_forwards f on f.id = v.current_forward_id where v.id = p_voucher_id;

  if p_action in ('forward', 'direct_share') and v_current.id is not null then
    raise exception 'ALREADY_FORWARDED';
  end if;
  if p_action in ('resend', 'cancel') and v_current.id is null then
    raise exception 'NO_ACTIVE_FORWARD';
  end if;
  if p_action = 'resend' and v_current.delivery_mode = 'direct_share' then
    raise exception 'NOT_RESENDABLE';
  end if;

  if p_action = 'cancel' then
    select * into v_current_link from app.access_links where voucher_id = p_voucher_id and link_type = 'forward' and revoked_at is null;
    if v_current_link.code_exposed_at is not null then
      raise exception 'CODE_EXPOSED';
    end if;
    update app.access_links set revoked_at = now(), revoked_reason = 'forward_cancelled', revoked_by = p_actor_type
     where voucher_id = p_voucher_id and link_type = 'forward' and revoked_at is null;
    insert into app.voucher_forwards (id, voucher_id, action, resend_of_forward_id, actor_type, client_request_id, delivery_mode)
    values (v_forward_id, p_voucher_id, 'cancel', v_current.id, p_actor_type, p_client_request_id, v_current.delivery_mode);
    update app.vouchers set current_forward_id = null, updated_at = now() where id = p_voucher_id;
    return query select v_forward_id, null::uuid, null::uuid, true;
    return;
  end if;

  -- forward / resend / direct_share: 새 링크를 만들고, 다시 보내기면 옛 링크를 닫는다
  update app.access_links set revoked_at = now(), revoked_reason = 'resent', revoked_by = p_actor_type
   where voucher_id = p_voucher_id and link_type = 'forward' and revoked_at is null;

  v_link_id := gen_random_uuid();
  if p_action <> 'direct_share' then
    v_msg_id := gen_random_uuid();
  end if;

  insert into app.voucher_forwards (
    id, voucher_id, action, resend_of_forward_id, actor_type, client_request_id, delivery_mode,
    to_name_enc, to_name_masked, to_phone_enc, to_phone_hash, to_phone_last4, is_self_number, message_id, access_link_id)
  values (
    v_forward_id, p_voucher_id, p_action,
    case when p_action = 'resend' then v_current.id end,
    p_actor_type, p_client_request_id,
    case when p_action = 'direct_share' then 'direct_share' else 'seorap_message' end,
    case when p_action = 'resend' then v_current.to_name_enc when p_action = 'forward' then p_to_name_enc end,
    case when p_action = 'resend' then v_current.to_name_masked when p_action = 'forward' then p_to_name_masked end,
    case when p_action = 'resend' then v_current.to_phone_enc when p_action = 'forward' then p_to_phone_enc end,
    case when p_action = 'resend' then v_current.to_phone_hash when p_action = 'forward' then p_to_phone_hash end,
    case when p_action = 'resend' then v_current.to_phone_last4 when p_action = 'forward' then p_to_phone_last4 end,
    case when p_action = 'resend' then v_current.is_self_number else coalesce(p_is_self, false) end,
    v_msg_id, v_link_id);

  insert into app.access_links (id, token_hash, link_type, voucher_id, forward_id, expires_at)
  values (v_link_id, p_token_hash, 'forward', p_voucher_id, v_forward_id, now() + make_interval(days => p_link_ttl_days));

  if v_msg_id is not null then
    insert into app.messages (id, purpose, template_code, template_version, requested_channel, to_kind, to_phone_hash, to_phone_last4, forward_id)
    select v_msg_id, 't2_forward', 't2_forward', 1, 'alimtalk', 'forward_receiver', f.to_phone_hash, f.to_phone_last4, v_forward_id
      from app.voucher_forwards f where f.id = v_forward_id;
  end if;

  update app.vouchers set current_forward_id = v_forward_id, updated_at = now() where id = p_voucher_id;
  return query select v_forward_id, v_msg_id, v_link_id, true;
end $$;

revoke all on function app.otp_register_failure(uuid, int) from public, anon, authenticated;
revoke all on function app.otp_consume(uuid) from public, anon, authenticated;
revoke all on function app.voucher_mark_exposed(uuid, boolean) from public, anon, authenticated;
revoke all on function app.forward_counts(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function app.forward_apply(text, uuid, text, text, text, int, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function app.otp_register_failure(uuid, int) to service_role;
grant execute on function app.otp_consume(uuid) to service_role;
grant execute on function app.voucher_mark_exposed(uuid, boolean) to service_role;
grant execute on function app.forward_counts(uuid, uuid, text, timestamptz) to service_role;
grant execute on function app.forward_apply(text, uuid, text, text, text, int, text, text, text, text, text, boolean) to service_role;
```

- [ ] **Step 2: 적용** — `supabase db reset` → 오류 없음

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261007000003_rpc.sql
git commit -m "feat(db): OTP·노출 기록·전달·한도 집계 원자 처리 함수"
```

(전달 함수의 동작은 Task 14 통합 테스트가 고정한다)

---

### Task 10: 암호·토큰 도구 `crypto.ts`

**Files:**
- Create: `supabase/functions/_shared/crypto.ts`, `supabase/functions/_shared/crypto.test.ts`

**Interfaces:**
- Produces: `hmac(value: string): Promise<string>` (hex 64자), `phoneHash(digits: string): Promise<string>` (= `hmac('phone:' + digits)`), `encrypt(key: 'A' | 'B', plain: string): Promise<string>`, `decrypt(key: 'A' | 'B', payload: string): Promise<string>`, `randomToken(len?: number): string` (기본 32, 영문 대소문자·숫자), `sixDigits(): string`. 환경변수 `SEORAP_HMAC_KEY`, `SEORAP_ENC_KEY_A`, `SEORAP_ENC_KEY_B`(base64 32바이트)를 처음 쓸 때 읽는다

- [ ] **Step 1: 실패하는 테스트**

`supabase/functions/_shared/crypto.test.ts`:

```ts
import { assert, assertEquals, assertNotEquals, assertRejects } from '@std/assert'

const k = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
Deno.env.set('SEORAP_HMAC_KEY', k())
Deno.env.set('SEORAP_ENC_KEY_A', k())
Deno.env.set('SEORAP_ENC_KEY_B', k())
const { decrypt, encrypt, hmac, phoneHash, randomToken, sixDigits } = await import('./crypto.ts')

Deno.test('hmac: 같은 입력은 같은 값, 64자 hex', async () => {
  const a = await hmac('x')
  assertEquals(a, await hmac('x'))
  assertNotEquals(a, await hmac('y'))
  assert(/^[0-9a-f]{64}$/.test(a))
})

Deno.test('phoneHash = hmac(phone:번호)', async () => {
  assertEquals(await phoneHash('01012345678'), await hmac('phone:01012345678'))
})

Deno.test('encrypt/decrypt 왕복, 매번 다른 암호문', async () => {
  const c1 = await encrypt('A', '홍길동')
  const c2 = await encrypt('A', '홍길동')
  assertNotEquals(c1, c2)
  assert(c1.startsWith('v1.'))
  assertEquals(await decrypt('A', c1), '홍길동')
})

Deno.test('다른 키로는 풀리지 않는다', async () => {
  const c = await encrypt('A', 'TEST-1')
  await assertRejects(() => decrypt('B', c))
})

Deno.test('randomToken: 32자 영문·숫자, 겹치지 않음', () => {
  const a = randomToken()
  assert(/^[A-Za-z0-9]{32}$/.test(a))
  assertNotEquals(a, randomToken())
})

Deno.test('sixDigits: 6자리 숫자', () => {
  for (let i = 0; i < 50; i++) assert(/^\d{6}$/.test(sixDigits()))
})
```

- [ ] **Step 2: 실패 확인** — `deno task test:core` → FAIL

- [ ] **Step 3: 구현**

`supabase/functions/_shared/crypto.ts`:

```ts
// HMAC·AES-GCM·무작위 토큰. 키는 환경변수(base64 32바이트), 처음 쓸 때 읽는다.
const enc = new TextEncoder()
const dec = new TextDecoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function unb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function envKey(name: string): Uint8Array {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`missing env ${name}`)
  return unb64(v.trim())
}

function hmacKey(): Promise<CryptoKey> {
  if (!keyCache.has('hmac')) {
    keyCache.set('hmac', crypto.subtle.importKey('raw', envKey('SEORAP_HMAC_KEY'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']))
  }
  return keyCache.get('hmac')!
}
function aesKey(name: 'A' | 'B'): Promise<CryptoKey> {
  const id = `aes${name}`
  if (!keyCache.has(id)) {
    keyCache.set(id, crypto.subtle.importKey('raw', envKey(`SEORAP_ENC_KEY_${name}`), 'AES-GCM', false, ['encrypt', 'decrypt']))
  }
  return keyCache.get(id)!
}

export async function hmac(value: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(value)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function phoneHash(digits: string): Promise<string> {
  return hmac(`phone:${digits}`)
}

export async function encrypt(key: 'A' | 'B', plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), enc.encode(plain)))
  return `v1.${b64(iv)}.${b64(ct)}`
}

export async function decrypt(key: 'A' | 'B', payload: string): Promise<string> {
  const [v, iv, ct] = payload.split('.')
  if (v !== 'v1' || !iv || !ct) throw new Error('bad ciphertext')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(key), unb64(ct))
  return dec.decode(pt)
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export function randomToken(len = 32): string {
  let out = ''
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 248 && out.length < len) out += ALPHABET[b % 62] // 248 = 62 * 4, 치우침 없이
    }
  }
  return out
}

export function sixDigits(): string {
  const limit = 4_294_000_000 // 1,000,000의 배수 이하만 받는다
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]
    if (n < limit) return String(n % 1_000_000).padStart(6, '0')
  }
}
```

- [ ] **Step 4: 통과 확인** — `deno task test:core` → PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/crypto.ts supabase/functions/_shared/crypto.test.ts
git commit -m "feat(shared): HMAC·AES-GCM·토큰·OTP 숫자 생성"
```

---

### Task 11: api 함수 뼈대 + 진입 + OTP (가짜 문자 어댑터)

**Files:**
- Create: `supabase/functions/api/index.ts`, `router.ts`, `lib/http.ts`, `lib/db.ts`, `lib/settings.ts`, `lib/session.ts`, `lib/links.ts`, `lib/events.ts`, `handlers/entry.ts`, `handlers/otp.ts`, `handlers/dev.ts`, `handlers/logout.ts`, `supabase/functions/_shared/adapters/types.ts`, `supabase/functions/_shared/adapters/mock.ts`, `scripts/seed.ts`(S1만 먼저), `tests/api/helpers.ts`, `tests/api/entry_otp.test.ts`

**Interfaces:**
- Consumes: Task 2~10 전부
- Produces:
  - `class ApiError extends Error { code: ErrorCode; status: number; extra: Record<string, unknown> }`, `json(status, body, headers?)`, `readJson<T>(req)`, `getCookie(req, name)`
  - `db(): SupabaseClient` (schema `app`, service role)
  - `getSettings(): Promise<Settings>`; `Settings` 키: `otp_ttl_seconds`(180) · `otp_max_attempts`(5) · `otp_resend_seconds`(60) · `otp_per_phone_hour`(5) · `otp_per_phone_day`(10) · `otp_lock_minutes`(15) · `session_mobile_idle_min`(60) · `session_mobile_max_hours`(24) · `session_desktop_idle_min`(30) · `forward_link_ttl_days`(180) · `forward_resend_per_voucher_day`(3) · `forward_same_number_gap_min`(10) · `forward_per_box_day_min`(20) · `box_window_months`(12) · `exam_status_enabled`(false) · `notice_banner`(null) · `mock_message_mode`('success' | 'fallback' | 'fail')
  - `createSession(recipientId, linkId, req): Promise<string>` (Set-Cookie 값), `requireSession(req): Promise<Session>`; `Session = { idHash, recipientId, accessLinkId, lastOtpAt }`
  - `findBoxLink(token): Promise<{ link, recipient }>` (없으면 `LINK_INVALID`, 닫혔으면 `LINK_REVOKED`)
  - `logEvent(name, fields)`
  - 어댑터: `SmsAdapter.sendOtp({ messageId, toPhone, code })`, `MessageAdapter.send({...})` (Task 14에서 사용), `getAdapters()`
  - 경로: `POST /api/entry`, `POST /api/otp/request`, `POST /api/otp/verify`, `POST /api/logout`, `GET /api/dev/outbox`
  - 시드 토큰: `tokenFor('S1') = 'seedS1' + '0' × 26` (32자)

- [ ] **Step 1: 통합 테스트 도우미와 실패하는 테스트**

`tests/api/helpers.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

export const BASE = Deno.env.get('API_BASE') ?? 'http://127.0.0.1:55321/functions/v1/api'
export const tokenFor = (s: string) => ('seed' + s).padEnd(32, '0')

export function adminDb() {
  return createClient(Deno.env.get('SEED_SUPABASE_URL')!, Deno.env.get('SEED_SERVICE_ROLE_KEY')!, {
    db: { schema: 'app' }, auth: { persistSession: false },
  })
}

export class Client {
  cookie = ''
  ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'
  async call(path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(`${BASE}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'User-Agent': this.ua,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const sc = res.headers.get('set-cookie')
    if (sc) this.cookie = sc.split(';')[0]
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : {} }
  }
}

export async function latestOtp(last4digits: string): Promise<string> {
  const { data } = await adminDb().from('dev_outbox').select('body').eq('kind', 'sms').eq('to_phone_last4', last4digits)
    .order('created_at', { ascending: false }).limit(1).single()
  return data!.body.match(/(\d{6})/)![1]
}

// OTP 재요청 간격(60초)·횟수 한도에 테스트가 걸리지 않게 설정을 바꿔 둔다.
// db:reset 직후 첫 파일만 함수의 설정 캐시(30초)가 비워질 때까지 기다린다.
export async function fastOtp() {
  const { data } = await adminDb().from('settings').select('value').eq('key', 'otp_resend_seconds').maybeSingle()
  if (data?.value === 0) return
  await adminDb().from('settings').upsert([{ key: 'otp_resend_seconds', value: 0 }, { key: 'otp_per_phone_hour', value: 100 }, { key: 'otp_per_phone_day', value: 100 }])
  await new Promise((r) => setTimeout(r, 31_000))
}

export async function login(scenario: string, last4digits: string): Promise<Client> {
  const c = new Client()
  const req = await c.call('otp/request', { token: tokenFor(scenario) })
  if (req.status !== 200) throw new Error(`otp request ${req.status} ${JSON.stringify(req.body)}`)
  const code = await latestOtp(last4digits)
  const v = await c.call('otp/verify', { token: tokenFor(scenario), code })
  if (v.status !== 200) throw new Error(`otp verify ${v.status} ${JSON.stringify(v.body)}`)
  return c
}
```

`tests/api/entry_otp.test.ts`:

```ts
import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, latestOtp, login, tokenFor } from './helpers.ts'

await fastOtp()

Deno.test('진입: 가린 이름·번호, 기록 없음', async () => {
  const before = (await adminDb().from('otp_challenges').select('id', { count: 'exact', head: true })).count
  const r = await new Client().call('entry', { token: tokenFor('S1') })
  assertEquals(r.status, 200)
  assertEquals(r.body.nameMasked, '홍*동')
  assertEquals(r.body.phoneMasked, '010-****-5678')
  const after = (await adminDb().from('otp_challenges').select('id', { count: 'exact', head: true })).count
  assertEquals(after, before)
})

Deno.test('진입: 형식이 다른 토큰은 LINK_INVALID', async () => {
  const r = await new Client().call('entry', { token: 'short' })
  assertEquals(r.status, 404)
  assertEquals(r.body.error.code, 'LINK_INVALID')
})

Deno.test('OTP: 맞으면 세션 쿠키', async () => {
  const c = await login('S1', '5678')
  assert(c.cookie.startsWith('seorap_sid='))
})

Deno.test('OTP: 새 번호를 받으면 이전 번호는 안 된다 (otp_old_code_rejected)', async () => {
  const c = new Client()
  await c.call('otp/request', { token: tokenFor('S1') })
  const oldCode = await latestOtp('5678')
  await c.call('otp/request', { token: tokenFor('S1') })
  const newCode = await latestOtp('5678')
  if (oldCode === newCode) return // 같은 숫자가 나올 확률 100만분의 1
  const r = await c.call('otp/verify', { token: tokenFor('S1'), code: oldCode })
  assertEquals(r.body.error.code, 'OTP_WRONG')
  assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code: newCode })).status, 200)
})

Deno.test('OTP: 5번 틀리면 잠기고, 잠긴 동안 맞는 번호도 거부', async () => {
  const c = new Client()
  await c.call('otp/request', { token: tokenFor('S1') })
  const code = await latestOtp('5678')
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 4; i++) assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code: wrong })).body.error.code, 'OTP_WRONG')
  assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code: wrong })).body.error.code, 'OTP_LOCKED')
  assertEquals((await c.call('otp/verify', { token: tokenFor('S1'), code })).body.error.code, 'OTP_LOCKED')
  // 다음 테스트를 위해 잠금 풀기
  await adminDb().from('otp_challenges').update({ locked_until: null }).not('locked_until', 'is', null)
})

Deno.test('dev/outbox: 로컬에서는 읽힌다', async () => {
  const r = await new Client().call('dev/outbox')
  assertEquals(r.status, 200)
  assert(Array.isArray(r.body.items))
})
```

- [ ] **Step 2: 실패 확인**

터미널 B: `deno task fn:serve` (함수가 아직 없으므로 시작 오류가 나거나, 호출이 404) → 터미널 A: `deno task test:api`
Expected: FAIL (연결 실패 또는 404)

- [ ] **Step 3: 어댑터 인터페이스와 가짜 구현**

`supabase/functions/_shared/adapters/types.ts`:

```ts
export interface SmsAdapter {
  sendOtp(req: { messageId: string; toPhone: string; code: string }): Promise<{ accepted: boolean }>
}
export interface MessageAdapter {
  send(req: {
    messageId: string
    purpose: 't1_box' | 't2_forward' | 't3_counsel' | 'phone_change_notice' | 'cancel_notice'
    toPhone: string
    templateCode: string
    variables: Record<string, string>
    buttonUrl?: string
    fallbackSms: boolean
  }): Promise<{ accepted: boolean }>
}
export type Adapters = { sms: SmsAdapter; message: MessageAdapter }
```

`supabase/functions/_shared/adapters/mock.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from '../core/copy.ko.ts'
import { last4 } from '../core/phone.ts'
import type { Adapters } from './types.ts'

// 가짜 문자·알림톡. 운영(SEORAP_ENV=production)에서는 만들 수 없다.
export function mockAdapters(db: SupabaseClient, mode: 'success' | 'fallback' | 'fail'): Adapters {
  if (Deno.env.get('SEORAP_ENV') === 'production') throw new Error('mock adapters are not allowed in production')
  return {
    sms: {
      async sendOtp({ messageId, toPhone, code }) {
        await db.from('dev_outbox').insert({ kind: 'sms', to_phone_last4: last4(toPhone), body: t('otp.sms', { code }) })
        await db.from('messages').update({ final_status: 'delivered', final_media: 'sms', accepted_at: new Date().toISOString(), final_at: new Date().toISOString() }).eq('id', messageId)
        await db.from('message_events').insert({ message_id: messageId, source: 'mock', event_type: 'delivered', media: 'sms' })
        return { accepted: true }
      },
    },
    message: {
      async send({ messageId, toPhone, templateCode, variables, buttonUrl }) {
        const body = `[알림톡 ${templateCode}] ${Object.entries(variables).map(([k, v]) => `${k}=${v}`).join(' ')} ${buttonUrl ?? ''}`.trim()
        await db.from('dev_outbox').insert({ kind: 'alimtalk', to_phone_last4: last4(toPhone), body })
        const now = new Date().toISOString()
        const result = mode === 'fail'
          ? { final_status: 'failed', final_media: null, fallback_used: true }
          : mode === 'fallback'
          ? { final_status: 'delivered', final_media: 'sms', fallback_used: true }
          : { final_status: 'delivered', final_media: 'alimtalk', fallback_used: false }
        await db.from('messages').update({ ...result, accepted_at: now, final_at: now }).eq('id', messageId)
        await db.from('message_events').insert({ message_id: messageId, source: 'mock', event_type: result.final_status, media: result.final_media })
        return { accepted: true }
      },
    },
  }
}
```

- [ ] **Step 4: 공용 라이브러리**

`supabase/functions/api/lib/http.ts`:

```ts
import type { ErrorCode } from '../../_shared/core/apiTypes.ts'

const STATUS: Record<ErrorCode, number> = {
  OTP_WRONG: 400, OTP_EXPIRED: 400, OTP_LOCKED: 423, RATE_LIMITED: 429, LINK_INVALID: 404, LINK_REVOKED: 410,
  SESSION_EXPIRED: 401, REAUTH_REQUIRED: 401, FORBIDDEN: 403, NOT_OWNER: 403, CONFLICT: 409, LIMIT_EXCEEDED: 429,
  VALIDATION: 422, UPSTREAM_FAILED: 502, MAINTENANCE: 503,
}

export class ApiError extends Error {
  code: ErrorCode
  status: number
  extra: Record<string, unknown>
  constructor(code: ErrorCode, extra: Record<string, unknown> = {}) {
    super(code)
    this.code = code
    this.status = STATUS[code]
    this.extra = extra
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError('VALIDATION', { field: 'body' })
  }
}

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

export function isMobile(req: Request): boolean {
  return /Mobi|Android|iPhone|iPad/i.test(req.headers.get('user-agent') ?? '')
}
```

`supabase/functions/api/lib/db.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'app' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

// supabase-js 오류를 그대로 던지지 않고, 개인정보 없이 짧게 남긴다
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}
```

`supabase/functions/api/lib/settings.ts`:

```ts
import { db } from './db.ts'

export const DEFAULTS = {
  otp_ttl_seconds: 180,
  otp_max_attempts: 5,
  otp_resend_seconds: 60,
  otp_per_phone_hour: 5,
  otp_per_phone_day: 10,
  otp_lock_minutes: 15,
  session_mobile_idle_min: 60,
  session_mobile_max_hours: 24,
  session_desktop_idle_min: 30,
  forward_link_ttl_days: 180,
  forward_resend_per_voucher_day: 3,
  forward_same_number_gap_min: 10,
  forward_per_box_day_min: 20,
  box_window_months: 12,
  exam_status_enabled: false,
  notice_banner: null as string | null,
  mock_message_mode: 'success' as 'success' | 'fallback' | 'fail',
}
export type Settings = typeof DEFAULTS

let cached: { at: number; value: Settings } | null = null
export async function getSettings(): Promise<Settings> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value
  const { data } = await db().from('settings').select('key, value')
  const value = { ...DEFAULTS } as Record<string, unknown>
  for (const row of data ?? []) if (row.key in DEFAULTS) value[row.key] = row.value
  cached = { at: Date.now(), value: value as Settings }
  return cached.value
}
```

`supabase/functions/api/lib/events.ts`:

```ts
import { db } from './db.ts'

export async function logEvent(name: string, f: { recipientId?: string; orderId?: string; voucherId?: string; sessionIdHash?: string; props?: Record<string, unknown> } = {}) {
  await db().from('events').insert({
    name,
    recipient_id: f.recipientId ?? null,
    order_id: f.orderId ?? null,
    voucher_id: f.voucherId ?? null,
    session_id_hash: f.sessionIdHash ?? null,
    props: f.props ?? {},
  })
}
```

`supabase/functions/api/lib/links.ts`:

```ts
import { hmac } from '../../_shared/crypto.ts'
import { db } from './db.ts'
import { ApiError } from './http.ts'

export const TOKEN_RE = /^[A-Za-z0-9]{32}$/

export type BoxLink = { id: string; recipient_id: string; revoked_at: string | null; revoked_reason: string | null }
export type RecipientRow = { id: string; phone_enc: string; phone_hash: string; phone_last4: string; name_enc: string | null; name_masked: string | null; status: string }

export async function findBoxLink(token: unknown): Promise<{ link: BoxLink; recipient: RecipientRow }> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new ApiError('LINK_INVALID')
  const { data: link } = await db().from('access_links')
    .select('id, recipient_id, revoked_at, revoked_reason')
    .eq('token_hash', await hmac(`box:${token}`)).eq('link_type', 'box').maybeSingle()
  if (!link) throw new ApiError('LINK_INVALID')
  if (link.revoked_at) throw new ApiError('LINK_REVOKED', { reason: link.revoked_reason })
  const { data: recipient } = await db().from('recipients')
    .select('id, phone_enc, phone_hash, phone_last4, name_enc, name_masked, status').eq('id', link.recipient_id).single()
  if (!recipient || recipient.status !== 'active') throw new ApiError('FORBIDDEN', { reason: 'blocked' })
  return { link, recipient }
}
```

(토큰 해시는 용도별 접두사를 붙인다: 서랍 링크 `box:`, 받는 분 링크 `forward:`, 세션 `sid:`, OTP `otp:<challengeId>:`)

`supabase/functions/api/lib/session.ts`:

```ts
import { hmac, randomToken } from '../../_shared/crypto.ts'
import { db } from './db.ts'
import { ApiError, getCookie, isMobile } from './http.ts'
import { getSettings } from './settings.ts'

export const COOKIE = 'seorap_sid'
export type Session = { idHash: string; recipientId: string; accessLinkId: string; lastOtpAt: string | null }

// maxAgeSec 가 null 이면 세션 쿠키(창을 닫으면 소멸, PC용)
function cookie(value: string, maxAgeSec: number | null): string {
  const secure = Deno.env.get('SEORAP_COOKIE_SECURE') === 'false' ? '' : '; Secure'
  const age = maxAgeSec === null ? '' : `; Max-Age=${maxAgeSec}`
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${age}${secure}`
}

export async function createSession(recipientId: string, linkId: string, req: Request): Promise<string> {
  const s = await getSettings()
  const mobile = isMobile(req)
  const now = Date.now()
  const idleMin = mobile ? s.session_mobile_idle_min : s.session_desktop_idle_min
  const absMs = mobile ? s.session_mobile_max_hours * 3_600_000 : idleMin * 60_000 * 4
  const id = randomToken(32)
  await db().from('customer_sessions').insert({
    id_hash: await hmac(`sid:${id}`),
    scope: 'box',
    recipient_id: recipientId,
    access_link_id: linkId,
    device_class: mobile ? 'mobile' : 'desktop',
    idle_expires_at: new Date(now + idleMin * 60_000).toISOString(),
    absolute_expires_at: new Date(now + absMs).toISOString(),
    last_otp_at: new Date(now).toISOString(),
  })
  return cookie(id, mobile ? s.session_mobile_max_hours * 3600 : null)
}

export function clearCookie(): string {
  return `${cookie('', 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export async function requireSession(req: Request): Promise<Session> {
  const raw = getCookie(req, COOKIE)
  if (!raw) throw new ApiError('SESSION_EXPIRED')
  const idHash = await hmac(`sid:${raw}`)
  const { data: row } = await db().from('customer_sessions')
    .select('id_hash, recipient_id, access_link_id, device_class, idle_expires_at, absolute_expires_at, last_otp_at, revoked_at')
    .eq('id_hash', idHash).maybeSingle()
  const now = Date.now()
  if (!row || row.revoked_at || Date.parse(row.idle_expires_at) < now || Date.parse(row.absolute_expires_at) < now) {
    throw new ApiError('SESSION_EXPIRED')
  }
  const s = await getSettings()
  const idleMin = row.device_class === 'mobile' ? s.session_mobile_idle_min : s.session_desktop_idle_min
  await db().from('customer_sessions').update({
    last_seen_at: new Date(now).toISOString(),
    idle_expires_at: new Date(Math.min(now + idleMin * 60_000, Date.parse(row.absolute_expires_at))).toISOString(),
  }).eq('id_hash', idHash)
  return { idHash, recipientId: row.recipient_id, accessLinkId: row.access_link_id, lastOtpAt: row.last_otp_at }
}
```

- [ ] **Step 5: 처리기 (진입·OTP·로그아웃·dev)**

`supabase/functions/api/handlers/entry.ts`:

```ts
import type { EntryResponse } from '../../_shared/core/apiTypes.ts'
import { maskPhone } from '../../_shared/core/phone.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { json, readJson } from '../lib/http.ts'
import { findBoxLink } from '../lib/links.ts'
import { getSettings } from '../lib/settings.ts'

export async function entry(req: Request): Promise<Response> {
  const { token } = await readJson<{ token: unknown }>(req)
  const { recipient } = await findBoxLink(token)
  const s = await getSettings()
  const body: EntryResponse = {
    nameMasked: recipient.name_masked ?? '',
    phoneMasked: maskPhone(await decrypt('A', recipient.phone_enc)),
    noticeBanner: s.notice_banner,
  }
  return json(200, body)
}
```

`supabase/functions/api/handlers/otp.ts`:

```ts
import { mockAdapters } from '../../_shared/adapters/mock.ts'
import type { OtpRequestResponse, OtpVerifyResponse } from '../../_shared/core/apiTypes.ts'
import { decrypt, hmac, sixDigits } from '../../_shared/crypto.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { findBoxLink } from '../lib/links.ts'
import { createSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

export async function otpRequest(req: Request): Promise<Response> {
  const { token } = await readJson<{ token: unknown }>(req)
  const { link, recipient } = await findBoxLink(token)
  const s = await getSettings()
  const now = Date.now()

  const { data: recent } = await db().from('otp_challenges').select('created_at, locked_until')
    .eq('access_link_id', link.id).order('created_at', { ascending: false }).limit(1)
  const last = recent?.[0]
  if (last?.locked_until && Date.parse(last.locked_until) > now) throw new ApiError('OTP_LOCKED', { until: last.locked_until })
  if (last && Date.parse(last.created_at) + s.otp_resend_seconds * 1000 > now) {
    throw new ApiError('RATE_LIMITED', { retryAt: new Date(Date.parse(last.created_at) + s.otp_resend_seconds * 1000).toISOString() })
  }
  const hourAgo = new Date(now - 3_600_000).toISOString()
  const dayAgo = new Date(now - 86_400_000).toISOString()
  const { count: hourCount } = await db().from('otp_challenges').select('id', { count: 'exact', head: true })
    .eq('target_phone_hash', recipient.phone_hash).gte('created_at', hourAgo)
  const { count: dayCount } = await db().from('otp_challenges').select('id', { count: 'exact', head: true })
    .eq('target_phone_hash', recipient.phone_hash).gte('created_at', dayAgo)
  if ((hourCount ?? 0) >= s.otp_per_phone_hour || (dayCount ?? 0) >= s.otp_per_phone_day) {
    throw new ApiError('RATE_LIMITED', { retryAt: new Date(now + 3_600_000).toISOString() })
  }

  const code = sixDigits()
  const challengeId = crypto.randomUUID()
  const messageId = crypto.randomUUID()
  const expiresAt = new Date(now + s.otp_ttl_seconds * 1000).toISOString()
  // 요청마다 별도 트랜잭션이므로, 서로 가리키는 행은 "먼저 만든 쪽을 나중에 가리키게" 순서로 저장한다
  must(await db().from('otp_challenges').insert({
    id: challengeId,
    access_link_id: link.id,
    target_phone_hash: recipient.phone_hash,
    code_hash: await hmac(`otp:${challengeId}:${code}`),
    expires_at: expiresAt,
    max_attempts: s.otp_max_attempts,
  }), 'otp insert')
  must(await db().from('messages').insert({
    id: messageId, purpose: 'otp', requested_channel: 'sms', to_kind: 'recipient',
    to_phone_hash: recipient.phone_hash, to_phone_last4: recipient.phone_last4, recipient_id: recipient.id, otp_id: challengeId,
  }), 'otp message insert')
  must(await db().from('otp_challenges').update({ message_id: messageId }).eq('id', challengeId), 'otp message link')

  const adapters = mockAdapters(db(), s.mock_message_mode)
  await adapters.sms.sendOtp({ messageId, toPhone: await decrypt('A', recipient.phone_enc), code })
  await logEvent('otp_requested', { recipientId: recipient.id })

  const body: OtpRequestResponse = { expiresAt, resendAt: new Date(now + s.otp_resend_seconds * 1000).toISOString() }
  return json(200, body)
}

export async function otpVerify(req: Request): Promise<Response> {
  const { token, code } = await readJson<{ token: unknown; code: unknown }>(req)
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new ApiError('VALIDATION', { field: 'code' })
  const { link, recipient } = await findBoxLink(token)
  const s = await getSettings()

  // 가장 최근 번호만 받는다 (Review Focus 1)
  const { data: rows } = await db().from('otp_challenges')
    .select('id, code_hash, expires_at, attempt_count, max_attempts, locked_until, consumed_at')
    .eq('access_link_id', link.id).order('created_at', { ascending: false }).limit(1)
  const ch = rows?.[0]
  if (!ch || ch.consumed_at) throw new ApiError('OTP_EXPIRED')
  if (ch.locked_until && Date.parse(ch.locked_until) > Date.now()) throw new ApiError('OTP_LOCKED', { until: ch.locked_until })
  if (Date.parse(ch.expires_at) < Date.now()) throw new ApiError('OTP_EXPIRED')

  if ((await hmac(`otp:${ch.id}:${code}`)) !== ch.code_hash) {
    const res = must(await db().rpc('otp_register_failure', { p_id: ch.id, p_lock_minutes: s.otp_lock_minutes }), 'otp failure')
    const r = (res as { out_attempt_count: number; out_max_attempts: number; out_locked_until: string | null }[])[0]
    await logEvent('otp_failed', { recipientId: recipient.id })
    if (r?.out_locked_until) throw new ApiError('OTP_LOCKED', { until: r.out_locked_until })
    throw new ApiError('OTP_WRONG', { remaining: Math.max(0, (r?.out_max_attempts ?? 5) - (r?.out_attempt_count ?? 0)) })
  }

  const consumed = must(await db().rpc('otp_consume', { p_id: ch.id }), 'otp consume')
  if (!consumed) throw new ApiError('OTP_EXPIRED')
  const setCookie = await createSession(recipient.id, link.id, req)
  await db().from('recipients').update({ last_login_at: new Date().toISOString() }).eq('id', recipient.id)
  await logEvent('otp_verified', { recipientId: recipient.id })
  const body: OtpVerifyResponse = { ok: true }
  return json(200, body, { 'Set-Cookie': setCookie })
}
```

`supabase/functions/api/handlers/logout.ts`:

```ts
import { db } from '../lib/db.ts'
import { json } from '../lib/http.ts'
import { clearCookie, requireSession } from '../lib/session.ts'

export async function logout(req: Request): Promise<Response> {
  try {
    const sess = await requireSession(req)
    await db().from('customer_sessions').update({ revoked_at: new Date().toISOString(), revoked_reason: 'logout' }).eq('id_hash', sess.idHash)
  } catch {
    // 이미 끝난 세션이어도 쿠키는 지운다
  }
  return json(200, { ok: true }, { 'Set-Cookie': clearCookie() })
}
```

`supabase/functions/api/handlers/dev.ts`:

```ts
import type { DevOutboxItem } from '../../_shared/core/apiTypes.ts'
import { db } from '../lib/db.ts'
import { ApiError, json } from '../lib/http.ts'

export async function devOutbox(): Promise<Response> {
  if (Deno.env.get('SEORAP_ENV') === 'production') throw new ApiError('FORBIDDEN')
  const { data } = await db().from('dev_outbox').select('id, created_at, kind, to_phone_last4, body').order('created_at', { ascending: false }).limit(30)
  const items: DevOutboxItem[] = (data ?? []).map((r) => ({ id: r.id, createdAt: r.created_at, kind: r.kind, toLast4: r.to_phone_last4, body: r.body }))
  return json(200, { items })
}
```

- [ ] **Step 6: 라우터와 진입점**

`supabase/functions/api/router.ts`:

```ts
import { devOutbox } from './handlers/dev.ts'
import { entry } from './handlers/entry.ts'
import { logout } from './handlers/logout.ts'
import { otpRequest, otpVerify } from './handlers/otp.ts'
import { ApiError, json } from './lib/http.ts'

type Handler = (req: Request) => Promise<Response>
export const routes: Record<string, Handler> = {
  'POST entry': entry,
  'POST otp/request': otpRequest,
  'POST otp/verify': otpVerify,
  'POST logout': logout,
  'GET dev/outbox': devOutbox,
}

export async function route(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/^.*?\/api\/?/, '').replace(/\/$/, '')
  const handler = routes[`${req.method} ${path}`]
  try {
    if (!handler) throw new ApiError('VALIDATION', { reason: 'unknown_route' })
    return await handler(req)
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: { code: e.code, extra: e.extra } })
    console.error('api error', path, e instanceof Error ? e.message : 'unknown') // 개인정보·토큰을 남기지 않는다
    return json(502, { error: { code: 'UPSTREAM_FAILED' } })
  }
}
```

`supabase/functions/api/index.ts`:

```ts
import { route } from './router.ts'

Deno.serve((req) => route(req))
```

- [ ] **Step 7: 시드 스크립트 (S1 먼저)**

`scripts/seed.ts`:

```ts
// 시드 시나리오 (로컬·미리보기 전용). 실행 전 supabase db reset 으로 비운다.
// 필요 환경변수: SEED_SUPABASE_URL, SEED_SERVICE_ROLE_KEY, SEED_KEYS_FILE(함수 비밀값 .env 경로)
import { createClient } from '@supabase/supabase-js'

const keysFile = Deno.env.get('SEED_KEYS_FILE') ?? 'supabase/functions/.env'
for (const line of (await Deno.readTextFile(keysFile)).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) Deno.env.set(m[1], m[2])
}
if (Deno.env.get('SEORAP_ENV') === 'production') throw new Error('seed is not allowed in production')

const { encrypt, hmac, phoneHash, randomToken } = await import('../supabase/functions/_shared/crypto.ts')
const { last4, maskName } = await import('../supabase/functions/_shared/core/phone.ts')

const db = createClient(Deno.env.get('SEED_SUPABASE_URL')!, Deno.env.get('SEED_SERVICE_ROLE_KEY')!, {
  db: { schema: 'app' }, auth: { persistSession: false },
})
const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data as T
}

export const tokenFor = (s: string) => ('seed' + s).padEnd(32, '0')

type TestUnit = { testItemId: string; testName: string; count: number }
type Unit = { launched?: string; forward?: { name: string; phone: string; opened?: boolean }; cancel?: 'checking' | 'cancelled'; lock?: string[]; issue?: 'issued' | 'failed' }

async function recipient(name: string, phone: string, firstAt: string, lastAt: string) {
  const r = must(await db.from('recipients').insert({
    phone_enc: await encrypt('A', phone), phone_hash: await phoneHash(phone), phone_last4: last4(phone),
    name_enc: await encrypt('A', name), name_masked: maskName(name), first_order_at: firstAt, last_order_at: lastAt,
  }).select('id').single(), 'recipient')
  return r.id as string
}

async function boxLink(recipientId: string, scenario: string) {
  must(await db.from('access_links').insert({ token_hash: await hmac(`box:${tokenFor(scenario)}`), link_type: 'box', recipient_id: recipientId }), 'box link')
}

async function order(o: {
  recipientId: string; orderNo: string; paidAt: string; productName: string; optionName: string; amount: number;
  tests: TestUnit[]; units: Unit[]; counsel?: boolean; ordererName?: string; recipientName: string
}) {
  const ord = must(await db.from('orders').insert({
    source: 'naver_api', external_order_id: o.orderNo, recipient_id: o.recipientId, paid_at: o.paidAt, ordered_at: o.paidAt,
    recipient_name_enc: await encrypt('A', o.recipientName), recipient_name_masked: maskName(o.recipientName),
    orderer_name_enc: o.ordererName ? await encrypt('A', o.ordererName) : null,
    orderer_name_masked: o.ordererName ? maskName(o.ordererName) : null,
    orderer_differs: !!o.ordererName,
  }).select('id').single(), 'order')
  const mapping = must(await db.from('product_mappings').insert({ key_type: 'product_option', naver_product_id: `NP-${o.orderNo}`, option_code: 'OPT-1', includes_counsel: !!o.counsel }).select('id').single(), 'mapping')
  for (const tu of o.tests) {
    must(await db.from('product_mapping_items').insert({ mapping_id: mapping.id, psy_item_id: tu.testItemId, test_name: tu.testName, count_per_unit: tu.count }), 'mapping item')
  }
  const expected = o.tests.reduce((a, b) => a + b.count, 0)
  const anyFailed = o.units.some((u) => u.issue === 'failed')
  const item = must(await db.from('order_items').insert({
    order_id: ord.id, naver_product_order_id: `${o.orderNo}-1`, naver_product_id: `NP-${o.orderNo}`, option_code: 'OPT-1',
    product_name: o.productName, option_name: o.optionName, quantity: 1, payment_amount: o.amount, mapping_id: mapping.id,
    process_status: anyFailed ? 'issue_failed' : 'dispatched', dispatch_status: anyFailed ? 'none' : 'done',
  }).select('id').single(), 'order item')
  const iss = must(await db.from('code_issuances').insert({
    order_item_id: item.id, idempotency_key: `${o.orderNo}-1`, expected_count: expected,
    issued_count: anyFailed ? 0 : expected, status: anyFailed ? 'failed' : 'succeeded',
  }).select('id').single(), 'issuance')

  let i = 0
  const ids: string[] = []
  for (const tu of o.tests) {
    for (let unitNo = 1; unitNo <= tu.count; unitNo++) {
      const u = o.units[i] ?? {}
      const code = `TEST-${o.orderNo.slice(-4)}-${String(i + 1).padStart(4, '0')}`
      const failed = u.issue === 'failed'
      const v = must(await db.from('vouchers').insert({
        order_item_id: item.id, order_id: ord.id, issuance_id: iss.id, test_item_id: tu.testItemId, test_name: tu.testName, unit_no: unitNo,
        code_enc: failed ? null : await encrypt('B', code), code_hash: failed ? null : await hmac(`code:${code}`),
        issue_status: failed ? 'failed' : 'issued', amount: Math.floor(o.amount / expected),
        first_launched_at: u.launched ?? null, last_launched_at: u.launched ?? null, launched_by: u.launched ? 'recipient' : null,
        first_code_exposed_at: u.launched ?? null,
        cancel_status: u.cancel ?? 'none', lock_reasons: u.lock ?? (o.counsel ? ['counsel_pending'] : []),
      }).select('id').single(), 'voucher')
      ids.push(v.id)
      if (u.forward) await forward(v.id, u.forward)
      i++
    }
  }
  return { orderId: ord.id as string, voucherIds: ids }
}

async function forward(voucherId: string, f: { name: string; phone: string; opened?: boolean }) {
  const r = must(await db.rpc('forward_apply', {
    p_action: 'forward', p_voucher_id: voucherId, p_client_request_id: crypto.randomUUID(), p_actor_type: 'recipient',
    p_token_hash: await hmac(`forward:${randomToken()}`), p_link_ttl_days: 180,
    p_to_name_enc: await encrypt('A', f.name), p_to_name_masked: maskName(f.name),
    p_to_phone_enc: await encrypt('A', f.phone), p_to_phone_hash: await phoneHash(f.phone), p_to_phone_last4: last4(f.phone), p_is_self: false,
  }), 'forward') as { out_forward_id: string; out_message_id: string; out_access_link_id: string }[]
  const now = new Date().toISOString()
  must(await db.from('messages').update({ final_status: 'delivered', final_media: 'alimtalk', accepted_at: now, final_at: now }).eq('id', r[0].out_message_id), 'msg')
  if (f.opened) must(await db.from('access_links').update({ first_opened_at: now }).eq('id', r[0].out_access_link_id), 'opened')
  return r[0]
}

const STS_INFANT = { testItemId: 'PSY-STS-INFANT', testName: 'STS 영유아 기질검사', count: 1 }
const STS_ADULT2 = { testItemId: 'PSY-STS-ADULT', testName: 'STS 성인 기질검사', count: 2 }

// S1 공구 온가족 3매
const r1 = await recipient('홍길동', '01012345678', '2026-09-30T01:00:00Z', '2026-10-22T01:00:00Z')
await boxLink(r1, 'S1')
await order({
  recipientId: r1, recipientName: '홍길동', orderNo: '2026102200001', paidAt: '2026-10-22T01:00:00Z',
  productName: '온가족 기질검사 패키지', optionName: '영아용(12~35개월) / 온가족 기질검사 패키지(영유아1+성인용2)', amount: 21500,
  tests: [STS_INFANT, STS_ADULT2],
  units: [{ launched: '2026-10-22T03:00:00Z' }, {}, { forward: { name: '김영희', phone: '01022223333', opened: true } }],
})

console.log('seed done')
```

(시나리오 S2~S8은 Task 12에서 이 파일 끝에 추가한다)

- [ ] **Step 8: 실행해서 통과 확인**

터미널 A: `deno task db:reset` (마이그레이션 + 시드)
터미널 B: `deno task fn:serve` (그대로 둔다. 파일이 바뀌면 다시 읽는다)
터미널 A: `deno task test:api`
Expected: PASS 6 tests

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/api supabase/functions/_shared/adapters scripts/seed.ts tests/api
git commit -m "feat(api): 함수 뼈대·진입·OTP·로그아웃·가짜 문자, 시드 S1"
```

---

### Task 12: 서랍 조회·전달 이력 + 시드 S2~S8

**Files:**
- Create: `supabase/functions/api/lib/ownership.ts`, `supabase/functions/api/lib/box.ts`, `supabase/functions/api/handlers/box.ts`, `supabase/functions/api/handlers/history.ts`, `tests/api/box.test.ts`
- Modify: `supabase/functions/api/router.ts` (경로 2개 추가), `scripts/seed.ts` (S2~S8 추가)

**Interfaces:**
- Consumes: `requireSession`, `lineStatus`, `decrypt`, `getSettings`
- Produces:
  - `loadOwnedVoucher(voucherId: string, recipientId: string): Promise<VoucherRow>` (남의 것과 없는 것은 똑같이 `NOT_OWNER`)
  - `lineInputs(vouchers: VoucherRow[], s: Settings): Promise<Map<string, { input: LineInput; forwardTo: {name, phone} | null }>>`
  - `buildBox(recipientId, s): Promise<BoxResponse>`, `buildHistory(recipientId, s): Promise<HistoryResponse>`
  - `VoucherRow` 칸: `id, order_id, order_item_id, test_item_id, test_name, unit_no, created_at, issue_status, cancel_status, exam_status, lock_reasons, first_launched_at, platform_deleted_at, current_forward_id, code_enc`
  - 경로 `GET /api/box`, `GET /api/history`

- [ ] **Step 1: 실패하는 테스트**

`tests/api/box.test.ts`:

```ts
import { assert, assertEquals } from '@std/assert'
import { adminDb, Client, fastOtp, login } from './helpers.ts'

await fastOtp()

Deno.test('서랍: S1 온가족 패키지가 3줄, 같은 검사 2매는 1·2번째', async () => {
  const c = await login('S1', '5678')
  const r = await c.call('box')
  assertEquals(r.status, 200)
  assertEquals(r.body.ownerName, '홍길동')
  const g = r.body.groups.find((x: any) => x.productName === '온가족 기질검사 패키지')
  assertEquals(g.lines.length, 3)
  const adult = g.lines.filter((l: any) => l.testName === 'STS 성인 기질검사')
  assertEquals(adult.map((l: any) => [l.unitNo, l.unitsOfTest]), [[1, 2], [2, 2]])
  assertEquals(g.lines[0].status.label.startsWith('실시함'), true)
  assertEquals(adult[0].status.actions, ['launch', 'forward'])
  assertEquals(adult[1].status.label, '전달함 · 김영희')
  assertEquals(adult[1].forwardTo, { name: '김영희', phone: '010-2222-3333' })
})

Deno.test('서랍: 응답 어디에도 코드 원문이 없다', async () => {
  const c = await login('S1', '5678')
  const text = JSON.stringify((await c.call('box')).body)
  assertEquals(text.includes('TEST-'), false)
  assertEquals(text.includes('v1.'), false)
})

Deno.test('서랍: S3 두 번 구매가 구매일 최신순, 다 쓴 묶음은 done', async () => {
  const c = await login('S1', '5678')
  const groups = (await c.call('box')).body.groups
  assertEquals(groups.length, 2)
  assert(groups[0].purchasedAt > groups[1].purchasedAt)
  assertEquals(groups[1].done, true)
})

Deno.test('서랍: S2 상담 주문은 잠김, S5 취소 줄, S7 준비 중', async () => {
  const s2 = (await (await login('S2', '6666')).call('box')).body.groups[0].lines
  assertEquals(s2[0].status.actions, ['counsel_form'])
  const s5 = (await (await login('S5', '8888')).call('box')).body.groups[0].lines.map((l: any) => l.status.label)
  assertEquals(s5.includes('취소됨'), true)
  assertEquals(s5.includes('취소 확인 중'), true)
  const s7 = (await (await login('S7', '1357')).call('box')).body.groups[0].lines[0]
  assertEquals(s7.status.label, '준비 중')
})

Deno.test('세션이 끝나면 401 SESSION_EXPIRED (expired_session_returns_401)', async () => {
  const c = await login('S1', '5678')
  await adminDb().from('customer_sessions').update({ idle_expires_at: '2020-01-01T00:00:00Z' }).neq('id_hash', '')
  const r = await c.call('box')
  assertEquals(r.status, 401)
  assertEquals(r.body.error.code, 'SESSION_EXPIRED')
})

Deno.test('쿠키 없이 부르면 401', async () => {
  assertEquals((await new Client().call('box')).status, 401)
})

Deno.test('전달 이력: S8은 전달·취소·전달 3줄, 최신순', async () => {
  const c = await login('S8', '2468')
  const items = (await c.call('history')).body.items
  assertEquals(items.map((i: any) => i.action), ['forward', 'cancel', 'forward'])
  assertEquals(items[0].toName, '유관순')
  assertEquals(items[0].result, 'delivered_alimtalk')
})
```

- [ ] **Step 2: 시드 S2~S8 추가**

`scripts/seed.ts`의 `console.log('seed done')` 바로 위에 추가:

```ts
const GOLDEN1 = { testItemId: 'PSY-GOLDEN', testName: 'GOLDEN 성격유형검사', count: 1 }
const GOLDEN2 = { ...GOLDEN1, count: 2 }
const STS_ADULT1 = { ...STS_ADULT2, count: 1 }

// S3 두 번 구매 (S1과 같은 번호 → 같은 서랍)
await order({
  recipientId: r1, recipientName: '홍길동', orderNo: '2026093000004', paidAt: '2026-09-30T01:00:00Z',
  productName: 'GOLDEN 성격유형검사', optionName: '2매', amount: 50000, tests: [GOLDEN2],
  units: [{ launched: '2026-10-01T02:00:00Z' }, { launched: '2026-10-02T02:00:00Z' }],
})

// S2 검사 + 상담
const r2 = await recipient('김철수', '01055556666', '2026-10-22T02:00:00Z', '2026-10-22T02:00:00Z')
await boxLink(r2, 'S2')
await order({
  recipientId: r2, recipientName: '김철수', orderNo: '2026102200002', paidAt: '2026-10-22T02:00:00Z',
  productName: 'GOLDEN 커플 상담 패키지', optionName: '커플 상담 1회 + GOLDEN 2매', amount: 150000,
  tests: [GOLDEN2], units: [{}, {}], counsel: true,
})

// S4 선물 주문 (구매자 ≠ 수취인)
const r4 = await recipient('성춘향', '01033334444', '2026-10-22T03:00:00Z', '2026-10-22T03:00:00Z')
await boxLink(r4, 'S4')
await order({
  recipientId: r4, recipientName: '성춘향', ordererName: '이몽룡', orderNo: '2026102200005', paidAt: '2026-10-22T03:00:00Z',
  productName: 'STS 성인 기질검사', optionName: '1매', amount: 12000, tests: [STS_ADULT1], units: [{}],
})

// S5 부분 취소
const r5 = await recipient('박영희', '01077778888', '2026-10-22T04:00:00Z', '2026-10-22T04:00:00Z')
await boxLink(r5, 'S5')
await order({
  recipientId: r5, recipientName: '박영희', orderNo: '2026102200006', paidAt: '2026-10-22T04:00:00Z',
  productName: '온가족 기질검사 패키지', optionName: '유아용(36~72개월) / 온가족', amount: 21500,
  tests: [STS_INFANT, STS_ADULT2], units: [{ cancel: 'cancelled' }, { cancel: 'checking' }, {}],
})

// S6 하루 여러 주문 (같은 날 5건)
const r6 = await recipient('최민수', '01099990000', '2026-10-22T05:00:00Z', '2026-10-22T09:00:00Z')
await boxLink(r6, 'S6')
const S6_ORDERS = ['2026102200007', '2026102200008', '2026102200009', '2026102200010', '2026102200011']
for (let n = 0; n < S6_ORDERS.length; n++) {
  await order({
    recipientId: r6, recipientName: '최민수', orderNo: S6_ORDERS[n], paidAt: `2026-10-22T0${5 + n}:00:00Z`,
    productName: 'STS 성인 기질검사', optionName: '1매', amount: 12000, tests: [STS_ADULT1], units: [{}],
  })
}

// S7 코드 발급 실패
const r7 = await recipient('정다은', '01024681357', '2026-10-22T06:00:00Z', '2026-10-22T06:00:00Z')
await boxLink(r7, 'S7')
await order({
  recipientId: r7, recipientName: '정다은', orderNo: '2026102200012', paidAt: '2026-10-22T06:00:00Z',
  productName: 'STS 성인 기질검사', optionName: '1매', amount: 12000, tests: [STS_ADULT1], units: [{ issue: 'failed' }],
})

// S8 전달 → 전달 취소 → 다른 번호로 전달
const r8 = await recipient('한지민', '01013572468', '2026-10-22T07:00:00Z', '2026-10-22T07:00:00Z')
await boxLink(r8, 'S8')
const s8 = await order({
  recipientId: r8, recipientName: '한지민', orderNo: '2026102200013', paidAt: '2026-10-22T07:00:00Z',
  productName: 'GOLDEN 성격유형검사', optionName: '1매', amount: 25000, tests: [GOLDEN1], units: [{}],
})
await forward(s8.voucherIds[0], { name: '이순신', phone: '01011112222' })
must(await db.rpc('forward_apply', {
  p_action: 'cancel', p_voucher_id: s8.voucherIds[0], p_client_request_id: crypto.randomUUID(), p_actor_type: 'recipient',
  p_token_hash: await hmac(`forward:${randomToken()}`), p_link_ttl_days: 180,
}), 'cancel')
await forward(s8.voucherIds[0], { name: '유관순', phone: '01033335555' })
```

테스트 파일은 이름순(box → entry_otp → forward → voucher)으로 돈다. 시나리오가 겹치지 않게 나눠 쓴다: forward 테스트는 S1·S5·S6(5매 중 4매)·S8, voucher 테스트는 S4와 S6의 남은 1매.

- [ ] **Step 3: 소유 검사와 서랍 조립**

`supabase/functions/api/lib/ownership.ts`:

```ts
import { db } from './db.ts'
import { ApiError } from './http.ts'

export const VOUCHER_COLS = 'id, order_id, order_item_id, test_item_id, test_name, unit_no, created_at, issue_status, cancel_status, exam_status, lock_reasons, first_launched_at, platform_deleted_at, current_forward_id, code_enc'
export type VoucherRow = {
  id: string; order_id: string; order_item_id: string; test_item_id: string; test_name: string; unit_no: number; created_at: string
  issue_status: 'pending' | 'issued' | 'failed' | 'voided' | 'replaced'
  cancel_status: 'none' | 'checking' | 'cancelled' | 'rejected'
  exam_status: null | 'unused' | 'in_progress' | 'completed' | 'deleted'
  lock_reasons: string[]; first_launched_at: string | null; platform_deleted_at: string | null
  current_forward_id: string | null; code_enc: string | null
}

// 남의 발송권과 없는 발송권을 똑같이 거부한다 (Review Focus 5)
export async function loadOwnedVoucher(voucherId: unknown, recipientId: string): Promise<VoucherRow> {
  if (typeof voucherId !== 'string' || !/^[0-9a-f-]{36}$/i.test(voucherId)) throw new ApiError('NOT_OWNER')
  const { data } = await db().from('vouchers').select(`${VOUCHER_COLS}, orders!inner(recipient_id)`).eq('id', voucherId).maybeSingle()
  const owner = (data as unknown as { orders: { recipient_id: string } } | null)?.orders?.recipient_id
  if (!data || owner !== recipientId) throw new ApiError('NOT_OWNER')
  return data as unknown as VoucherRow
}
```

`supabase/functions/api/lib/box.ts`:

```ts
import type { BoxGroup, BoxLine, BoxResponse, HistoryItem, HistoryResponse, HistoryResult } from '../../_shared/core/apiTypes.ts'
import { type LineInput, lineStatus } from '../../_shared/core/lineStatus.ts'
import { formatPhone } from '../../_shared/core/phone.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { db } from './db.ts'
import { type VoucherRow, VOUCHER_COLS } from './ownership.ts'
import type { Settings } from './settings.ts'

type ForwardRow = { id: string; actor_type: string; to_name_enc: string | null; to_name_masked: string | null; to_phone_enc: string | null; to_phone_last4: string | null; access_link_id: string | null }

async function forwardDisplay(f: ForwardRow): Promise<{ name: string; phone: string }> {
  // 본인이 입력한 값은 본인에게 그대로 보여 준다. 어드민이 대신 보낸 것은 가린다.
  if (f.actor_type === 'recipient' && f.to_name_enc && f.to_phone_enc) {
    return { name: await decrypt('A', f.to_name_enc), phone: formatPhone(await decrypt('A', f.to_phone_enc)) }
  }
  return { name: f.to_name_masked ?? '', phone: `010-****-${f.to_phone_last4 ?? ''}` }
}

export async function lineInputs(vouchers: VoucherRow[], s: Settings) {
  const fwdIds = vouchers.map((v) => v.current_forward_id).filter((x): x is string => !!x)
  const { data: fwds } = fwdIds.length
    ? await db().from('voucher_forwards').select('id, actor_type, to_name_enc, to_name_masked, to_phone_enc, to_phone_last4, access_link_id').in('id', fwdIds)
    : { data: [] as ForwardRow[] }
  const linkIds = (fwds ?? []).map((f) => f.access_link_id).filter((x): x is string => !!x)
  const { data: links } = linkIds.length
    ? await db().from('access_links').select('id, first_opened_at, code_exposed_at').in('id', linkIds)
    : { data: [] as { id: string; first_opened_at: string | null; code_exposed_at: string | null }[] }
  const fwdById = new Map((fwds ?? []).map((f) => [f.id, f as ForwardRow]))
  const linkById = new Map((links ?? []).map((l) => [l.id, l]))

  const out = new Map<string, { input: LineInput; forwardTo: { name: string; phone: string } | null }>()
  for (const v of vouchers) {
    const f = v.current_forward_id ? fwdById.get(v.current_forward_id) : undefined
    const link = f?.access_link_id ? linkById.get(f.access_link_id) : undefined
    const forwardTo = f ? await forwardDisplay(f) : null
    out.set(v.id, {
      forwardTo,
      input: {
        issueStatus: v.issue_status,
        cancelStatus: v.cancel_status,
        cancelRejectReason: null, // Plan C에서 cancellations.reject_reason 연결
        examStatus: v.exam_status,
        examStatusEnabled: s.exam_status_enabled,
        lockReasons: v.lock_reasons ?? [],
        firstLaunchedAt: v.first_launched_at,
        platformDeletedAt: v.platform_deleted_at,
        forward: f && forwardTo ? { displayName: forwardTo.name, openedAt: link?.first_opened_at ?? null, codeExposed: !!link?.code_exposed_at } : null,
      },
    })
  }
  return out
}

function windowStart(s: Settings): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - s.box_window_months)
  return d.toISOString()
}

async function myVouchers(recipientId: string, s: Settings) {
  const { data: orders } = await db().from('orders').select('id, paid_at').eq('recipient_id', recipientId)
    .gte('paid_at', windowStart(s)).order('paid_at', { ascending: false })
  const orderIds = (orders ?? []).map((o) => o.id)
  if (!orderIds.length) return { orders: [], items: [], vouchers: [] as VoucherRow[] }
  const { data: items } = await db().from('order_items').select('id, order_id, product_name').in('order_id', orderIds)
  const { data: vouchers } = await db().from('vouchers').select(VOUCHER_COLS).in('order_id', orderIds).neq('issue_status', 'replaced')
    .order('created_at', { ascending: true }).order('unit_no', { ascending: true })
  return { orders: orders ?? [], items: items ?? [], vouchers: (vouchers ?? []) as unknown as VoucherRow[] }
}

export async function buildBox(recipientId: string, s: Settings): Promise<BoxResponse> {
  const { data: rec } = await db().from('recipients').select('name_enc').eq('id', recipientId).single()
  const { orders, items, vouchers } = await myVouchers(recipientId, s)
  const inputs = await lineInputs(vouchers, s)
  const unitsOf = new Map<string, number>()
  for (const v of vouchers) unitsOf.set(`${v.order_item_id}|${v.test_item_id}`, (unitsOf.get(`${v.order_item_id}|${v.test_item_id}`) ?? 0) + 1)

  const groups: BoxGroup[] = orders.map((o) => {
    const lines: BoxLine[] = vouchers.filter((v) => v.order_id === o.id).map((v) => {
      const li = inputs.get(v.id)!
      return {
        voucherId: v.id, testItemId: v.test_item_id, testName: v.test_name, unitNo: v.unit_no,
        unitsOfTest: unitsOf.get(`${v.order_item_id}|${v.test_item_id}`) ?? 1,
        status: lineStatus(li.input), firstLaunchedAt: v.first_launched_at, forwardTo: li.forwardTo,
      }
    })
    const productName = items.find((i) => i.order_id === o.id)?.product_name ?? ''
    const done = lines.every((l) => !l.status.actions.some((a) => a === 'launch' || a === 'forward' || a === 'counsel_form'))
    return { orderId: o.id, purchasedAt: o.paid_at, productName, lineCount: lines.length, done, lines }
  })
  return {
    ownerName: rec?.name_enc ? await decrypt('A', rec.name_enc) : '',
    notStartedCount: groups.flatMap((g) => g.lines).filter((l) => l.status.actions.includes('launch')).length,
    noticeBanner: s.notice_banner,
    groups,
  }
}

function resultOf(r: { final_status: string | null; final_media: string | null }): HistoryResult | null {
  if (!r.final_status) return null
  if (r.final_status === 'delivered') return r.final_media === 'alimtalk' ? 'delivered_alimtalk' : 'delivered_sms'
  if (r.final_status === 'failed') return 'failed'
  return 'sending'
}

export async function buildHistory(recipientId: string, s: Settings): Promise<HistoryResponse> {
  const { vouchers } = await myVouchers(recipientId, s)
  if (!vouchers.length) return { items: [] }
  const { data: rows } = await db().from('v_forward_log')
    .select('id, voucher_id, action, actor_type, created_at, to_name_enc, to_name_masked, to_phone_enc, to_phone_last4, final_status, final_media, first_opened_at')
    .in('voucher_id', vouchers.map((v) => v.id)).order('created_at', { ascending: false })
  const byId = new Map(vouchers.map((v) => [v.id, v]))
  const items: HistoryItem[] = []
  for (const r of rows ?? []) {
    const v = byId.get(r.voucher_id)!
    const disp = r.to_name_enc || r.to_name_masked ? await forwardDisplay(r as unknown as ForwardRow) : null
    items.push({
      id: r.id, at: r.created_at, action: r.action, testName: v.test_name, unitNo: v.unit_no,
      toName: disp?.name ?? null, toPhone: disp?.phone ?? null, result: resultOf(r), openedAt: r.first_opened_at,
    })
  }
  // 취소 줄에는 이름이 없으므로, 바로 앞(시간상 이전) 전달의 이름을 붙인다
  for (let i = 0; i < items.length; i++) {
    if (items[i].action === 'cancel') {
      const prev = items.slice(i + 1).find((x) => x.action !== 'cancel' && rowsVoucher(rows ?? [], x.id) === rowsVoucher(rows ?? [], items[i].id))
      items[i].toName = prev?.toName ?? null
    }
  }
  return { items }
}

function rowsVoucher(rows: { id: string; voucher_id: string }[], id: string): string | undefined {
  return rows.find((r) => r.id === id)?.voucher_id
}
```

`supabase/functions/api/handlers/box.ts`:

```ts
import { buildBox } from '../lib/box.ts'
import { logEvent } from '../lib/events.ts'
import { json } from '../lib/http.ts'
import { requireSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

export async function box(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  const body = await buildBox(sess.recipientId, await getSettings())
  await logEvent('box_view', { recipientId: sess.recipientId, sessionIdHash: sess.idHash })
  return json(200, body)
}
```

`supabase/functions/api/handlers/history.ts`:

```ts
import { buildHistory } from '../lib/box.ts'
import { json } from '../lib/http.ts'
import { requireSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

export async function history(req: Request): Promise<Response> {
  const sess = await requireSession(req)
  return json(200, await buildHistory(sess.recipientId, await getSettings()))
}
```

`router.ts`의 import에 `import { box } from './handlers/box.ts'`, `import { history } from './handlers/history.ts'`를 넣고 `routes`에 추가:

```ts
  'GET box': box,
  'GET history': history,
```

- [ ] **Step 4: 실행**

`deno task db:reset` → (함수 서버는 파일이 바뀌면 자동으로 다시 읽는다) → `deno task test:api`
Expected: PASS (entry_otp 6 + box 7)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/api scripts/seed.ts tests/api/box.test.ts
git commit -m "feat(api): 서랍 조회·전달 이력, 소유 검사, 시드 S2~S8"
```

---

### Task 13: 실시하기·코드 보기

**Files:**
- Create: `supabase/functions/api/handlers/voucher.ts`, `tests/api/voucher.test.ts`
- Modify: `supabase/functions/api/router.ts`, `supabase/functions/.env.example`(없으면 생성, 키 이름만)

**Interfaces:**
- Consumes: `loadOwnedVoucher`, `lineInputs`, `lineStatus`, `decrypt`, RPC `voucher_mark_exposed`
- Produces: `POST /api/voucher/launch {voucherId} → LaunchResponse { url }` (URL = `SEORAP_PLATFORM_TEST_URL + '/' + encodeURIComponent(code)`), `POST /api/voucher/code {voucherId} → CodeResponse { code }`. 상태가 실시하기·이어서 하기를 허용하지 않으면 `CONFLICT { reason: 'not_launchable' }`

- [ ] **Step 1: 실패하는 테스트**

`tests/api/voucher.test.ts`:

```ts
import { assert, assertEquals } from '@std/assert'
import { adminDb, fastOtp, login } from './helpers.ts'

await fastOtp()
const lines = async (c: Awaited<ReturnType<typeof login>>) => (await c.call('box')).body.groups.flatMap((g: any) => g.lines)

Deno.test('실시하기: 플랫폼 주소를 주고 실시 기록을 남긴다', async () => {
  const c = await login('S4', '4444')
  const line = (await lines(c)).find((l: any) => l.status.actions.includes('launch'))
  const r = await c.call('voucher/launch', { voucherId: line.voucherId })
  assertEquals(r.status, 200)
  assert(r.body.url.startsWith('https://inpsyt.co.kr/inpsyt/testing/TEST-'))
  const after = (await lines(c)).find((l: any) => l.voucherId === line.voucherId)
  assert(after.status.label.startsWith('실시함'))
  assertEquals(after.status.actions, ['continue'])
})

Deno.test('코드 보기: 코드를 주고 노출 시각을 남긴다', async () => {
  const c = await login('S6', '0000')
  const line = (await lines(c)).find((l: any) => l.status.actions.includes('launch'))
  const r = await c.call('voucher/code', { voucherId: line.voucherId })
  assert(r.body.code.startsWith('TEST-'))
  const { data } = await adminDb().from('vouchers').select('first_code_exposed_at').eq('id', line.voucherId).single()
  assert(data!.first_code_exposed_at)
})

Deno.test('전달된 줄은 실시할 수 없다', async () => {
  const c = await login('S1', '5678')
  const fwd = (await lines(c)).find((l: any) => l.status.label.startsWith('전달함'))
  const r = await c.call('voucher/launch', { voucherId: fwd.voucherId })
  assertEquals(r.status, 409)
})

Deno.test('남의 것과 없는 것은 똑같이 NOT_OWNER (not_owner_and_unknown_look_same)', async () => {
  const mine = await login('S1', '5678')
  const other = await login('S4', '4444')
  const someoneElse = (await lines(other))[0].voucherId
  const a = await mine.call('voucher/code', { voucherId: someoneElse })
  const b = await mine.call('voucher/code', { voucherId: '00000000-0000-0000-0000-000000000000' })
  assertEquals([a.status, a.body.error.code], [403, 'NOT_OWNER'])
  assertEquals([b.status, b.body.error.code], [403, 'NOT_OWNER'])
})
```

- [ ] **Step 2: 실패 확인** — `deno task test:api` → voucher 테스트 FAIL (404/unknown_route)

- [ ] **Step 3: 구현**

`supabase/functions/api/handlers/voucher.ts`:

```ts
import type { CodeResponse, LaunchResponse } from '../../_shared/core/apiTypes.ts'
import { lineStatus } from '../../_shared/core/lineStatus.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { lineInputs } from '../lib/box.ts'
import { db, must } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { loadOwnedVoucher } from '../lib/ownership.ts'
import { requireSession } from '../lib/session.ts'
import { getSettings } from '../lib/settings.ts'

async function launchable(req: Request) {
  const sess = await requireSession(req)
  const { voucherId } = await readJson<{ voucherId: unknown }>(req)
  const v = await loadOwnedVoucher(voucherId, sess.recipientId)
  const li = (await lineInputs([v], await getSettings())).get(v.id)!
  const actions = lineStatus(li.input).actions
  if (!actions.includes('launch') && !actions.includes('continue')) throw new ApiError('CONFLICT', { reason: 'not_launchable' })
  if (!v.code_enc) throw new ApiError('CONFLICT', { reason: 'not_issued' })
  return { sess, v, code: await decrypt('B', v.code_enc) }
}

export async function voucherLaunch(req: Request): Promise<Response> {
  const { sess, v, code } = await launchable(req)
  must(await db().rpc('voucher_mark_exposed', { p_voucher_id: v.id, p_launch: true }), 'mark launch')
  await logEvent('voucher_launch', { recipientId: sess.recipientId, voucherId: v.id, orderId: v.order_id })
  const base = Deno.env.get('SEORAP_PLATFORM_TEST_URL') ?? 'https://inpsyt.co.kr/inpsyt/testing'
  const body: LaunchResponse = { url: `${base}/${encodeURIComponent(code)}` }
  return json(200, body)
}

export async function voucherCode(req: Request): Promise<Response> {
  const { sess, v, code } = await launchable(req)
  must(await db().rpc('voucher_mark_exposed', { p_voucher_id: v.id, p_launch: false }), 'mark code')
  await logEvent('voucher_code_reveal', { recipientId: sess.recipientId, voucherId: v.id, orderId: v.order_id })
  const body: CodeResponse = { code }
  return json(200, body)
}
```

`router.ts`: `import { voucherCode, voucherLaunch } from './handlers/voucher.ts'` 그리고

```ts
  'POST voucher/launch': voucherLaunch,
  'POST voucher/code': voucherCode,
```

`supabase/functions/.env.example`:

```
SEORAP_ENV=local
SEORAP_HMAC_KEY=
SEORAP_ENC_KEY_A=
SEORAP_ENC_KEY_B=
SEORAP_COOKIE_SECURE=false
SEORAP_PUBLIC_BASE=http://localhost:5173
SEORAP_PLATFORM_TEST_URL=https://inpsyt.co.kr/inpsyt/testing
```

- [ ] **Step 4: 실행** — `deno task db:reset` → `deno task test:api` → PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/api tests/api/voucher.test.ts supabase/functions/.env.example
git commit -m "feat(api): 실시하기·코드 보기, 소유·상태 검사"
```

---

### Task 14: 전달·다시 보내기·다른 분께·직접 공유 (가짜 알림톡)

**Files:**
- Create: `supabase/functions/api/lib/messages.ts`, `supabase/functions/api/handlers/forward.ts`, `tests/api/forward.test.ts`
- Modify: `supabase/functions/api/router.ts`

**Interfaces:**
- Consumes: `forward_apply`, `forward_counts`, `checkForwardLimits`, `kstDayStart`, `normalizePhone`, `maskName`, `last4`, `phoneHash`, `encrypt`, `randomToken`, `mockAdapters`
- Produces:
  - `POST /api/forward/create { voucherId, name, phone, clientRequestId, confirmSelf? } → ForwardResponse`
  - `POST /api/forward/resend { voucherId, clientRequestId } → ForwardResponse`
  - `POST /api/forward/cancel { voucherId, clientRequestId } → ForwardResponse`
  - `POST /api/forward/direct { voucherId, clientRequestId } → DirectShareResponse`
  - 오류: `VALIDATION {field}`, `CONFLICT {reason: 'not_forwardable' | 'self_number' | 'code_exposed' | 'no_active_forward' | 'not_resendable'}`, `LIMIT_EXCEEDED {reason, retryAt}`

- [ ] **Step 1: 실패하는 테스트**

`tests/api/forward.test.ts`:

```ts
import { assert, assertEquals } from '@std/assert'
import { adminDb, fastOtp, login } from './helpers.ts'

await fastOtp()
const lines = async (c: Awaited<ReturnType<typeof login>>) => (await c.call('box')).body.groups.flatMap((g: any) => g.lines)
const rid = () => crypto.randomUUID()

Deno.test('전달: 이름·번호로 보내면 이력 1줄과 받는 분 링크', async () => {
  const c = await login('S1', '5678')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const r = await c.call('forward/create', { voucherId: target.voucherId, name: '이몽룡', phone: '010 9876 5432', clientRequestId: rid() })
  assertEquals(r.status, 200)
  assertEquals(r.body.created, true)
  const after = (await lines(c)).find((l: any) => l.voucherId === target.voucherId)
  assertEquals(after.status.label, '전달함 · 이몽룡')
  assertEquals(after.forwardTo.phone, '010-9876-5432')
  const hist = (await c.call('history')).body.items
  assertEquals(hist[0].toName, '이몽룡')
  assertEquals(hist[0].result, 'delivered_alimtalk')
  const { data: box } = await adminDb().from('dev_outbox').select('body').eq('kind', 'alimtalk').eq('to_phone_last4', '5432').order('created_at', { ascending: false }).limit(1).single()
  assert(/\/f\/[A-Za-z0-9]{32}/.test(box!.body))
})

Deno.test('전달: 같은 요청 ID는 한 번만 처리 (연타)', async () => {
  const c = await login('S6', '0000')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const id = rid()
  const body = { voucherId: target.voucherId, name: '홍길동', phone: '01022224444', clientRequestId: id }
  const [a, b] = await Promise.all([c.call('forward/create', body), c.call('forward/create', body)])
  assertEquals([a.status, b.status], [200, 200])
  assertEquals(a.body.forwardId, b.body.forwardId)
  const { count } = await adminDb().from('voucher_forwards').select('id', { count: 'exact', head: true }).eq('client_request_id', id)
  assertEquals(count, 1)
})

Deno.test('전달: 잘못된 번호·이름은 VALIDATION', async () => {
  const c = await login('S6', '0000')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  assertEquals((await c.call('forward/create', { voucherId: target.voucherId, name: '이몽룡', phone: '02-123-4567', clientRequestId: rid() })).body.error.extra.field, 'phone')
  assertEquals((await c.call('forward/create', { voucherId: target.voucherId, name: '', phone: '01011112222', clientRequestId: rid() })).body.error.extra.field, 'name')
})

Deno.test('전달: 본인 번호는 확인을 요구한다', async () => {
  const c = await login('S6', '0000')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const r = await c.call('forward/create', { voucherId: target.voucherId, name: '나', phone: '01099990000', clientRequestId: rid() })
  assertEquals([r.status, r.body.error.extra.reason], [409, 'self_number'])
  const ok = await c.call('forward/create', { voucherId: target.voucherId, name: '나', phone: '01099990000', clientRequestId: rid(), confirmSelf: true })
  assertEquals(ok.status, 200)
})

Deno.test('같은 번호로 10분 안에 다시 보내면 LIMIT_EXCEEDED', async () => {
  const c = await login('S6', '0000')
  const free = (await lines(c)).filter((l: any) => l.status.actions.includes('forward'))
  await c.call('forward/create', { voucherId: free[0].voucherId, name: '동생', phone: '01077770000', clientRequestId: rid() })
  const r = await c.call('forward/create', { voucherId: free[1].voucherId, name: '동생', phone: '01077770000', clientRequestId: rid() })
  assertEquals([r.status, r.body.error.code, r.body.error.extra.reason], [429, 'LIMIT_EXCEEDED', 'same_number_gap'])
})

Deno.test('다른 분께: 코드 노출 전에는 취소, 노출 후에는 거부', async () => {
  const c = await login('S1', '5678')
  const fwd = (await lines(c)).find((l: any) => l.status.actions.includes('reforward'))
  // 받는 분이 코드를 봤다고 표시
  const { data: v } = await adminDb().from('vouchers').select('current_forward_id').eq('id', fwd.voucherId).single()
  const { data: f } = await adminDb().from('voucher_forwards').select('access_link_id').eq('id', v!.current_forward_id).single()
  await adminDb().from('access_links').update({ code_exposed_at: new Date().toISOString() }).eq('id', f!.access_link_id)
  const blocked = await c.call('forward/cancel', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals([blocked.status, blocked.body.error.extra.reason], [409, 'code_exposed'])
  await adminDb().from('access_links').update({ code_exposed_at: null }).eq('id', f!.access_link_id)
  const ok = await c.call('forward/cancel', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals(ok.status, 200)
  const after = (await lines(c)).find((l: any) => l.voucherId === fwd.voucherId)
  assertEquals(after.status.actions, ['launch', 'forward'])
  const { data: link } = await adminDb().from('access_links').select('revoked_reason').eq('id', f!.access_link_id).single()
  assertEquals(link!.revoked_reason, 'forward_cancelled')
})

Deno.test('다시 보내기: 새 링크, 옛 링크는 resent로 닫힘', async () => {
  const c = await login('S8', '2468')
  const fwd = (await lines(c))[0]
  const r = await c.call('forward/resend', { voucherId: fwd.voucherId, clientRequestId: rid() })
  assertEquals(r.status, 200)
  const items = (await c.call('history')).body.items
  assertEquals(items[0].action, 'resend')
  assertEquals(items[0].toName, '유관순')
})

Deno.test('직접 공유: 복사할 문구에 받는 분 링크, 이력은 받는 분 미확인', async () => {
  const c = await login('S5', '8888')
  const target = (await lines(c)).find((l: any) => l.status.actions.includes('forward'))
  const r = await c.call('forward/direct', { voucherId: target.voucherId, clientRequestId: rid() })
  assertEquals(r.status, 200)
  assert(/\/f\/[A-Za-z0-9]{32}$/.test(r.body.url))
  assertEquals(r.body.text.includes('심리검사'), true)
  assertEquals(r.body.text.includes('STS'), false)
  assertEquals((await c.call('history')).body.items[0].action, 'direct_share')
})
```

- [ ] **Step 2: 실패 확인** — `deno task test:api` → forward 테스트 FAIL

- [ ] **Step 3: 메시지 발송 도우미**

`supabase/functions/api/lib/messages.ts`:

```ts
import { mockAdapters } from '../../_shared/adapters/mock.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { db } from './db.ts'
import type { Settings } from './settings.ts'

export function publicBase(): string {
  return (Deno.env.get('SEORAP_PUBLIC_BASE') ?? 'http://localhost:5173').replace(/\/$/, '')
}

// 받는 분 알림(T2). 토큰 원문은 저장하지 않으므로 호출하는 쪽이 넘긴다.
export async function sendForwardMessage(forwardId: string, token: string, senderMasked: string, s: Settings) {
  const { data: f } = await db().from('voucher_forwards').select('message_id, to_name_enc, to_phone_enc').eq('id', forwardId).single()
  if (!f?.message_id || !f.to_phone_enc) return
  const adapters = mockAdapters(db(), s.mock_message_mode)
  await adapters.message.send({
    messageId: f.message_id,
    purpose: 't2_forward',
    toPhone: await decrypt('A', f.to_phone_enc),
    templateCode: 't2_forward',
    variables: { receiver: f.to_name_enc ? await decrypt('A', f.to_name_enc) : '', sender: senderMasked },
    buttonUrl: `${publicBase()}/f/${token}`,
    fallbackSms: true,
  })
}
```

- [ ] **Step 4: 전달 처리기**

`supabase/functions/api/handlers/forward.ts`:

```ts
import type { DirectShareResponse, ForwardResponse } from '../../_shared/core/apiTypes.ts'
import { t } from '../../_shared/core/copy.ko.ts'
import { checkForwardLimits } from '../../_shared/core/limits.ts'
import { lineStatus } from '../../_shared/core/lineStatus.ts'
import { last4, maskName, normalizePhone } from '../../_shared/core/phone.ts'
import { kstDayStart } from '../../_shared/core/time.ts'
import { encrypt, hmac, phoneHash, randomToken } from '../../_shared/crypto.ts'
import { lineInputs } from '../lib/box.ts'
import { db } from '../lib/db.ts'
import { logEvent } from '../lib/events.ts'
import { ApiError, json, readJson } from '../lib/http.ts'
import { publicBase, sendForwardMessage } from '../lib/messages.ts'
import { loadOwnedVoucher, type VoucherRow } from '../lib/ownership.ts'
import { requireSession, type Session } from '../lib/session.ts'
import { getSettings, type Settings } from '../lib/settings.ts'

type Body = { voucherId?: unknown; name?: unknown; phone?: unknown; clientRequestId?: unknown; confirmSelf?: unknown }
type ApplyRow = { out_forward_id: string; out_message_id: string | null; out_access_link_id: string | null; out_created: boolean }

const RPC_ERRORS: Record<string, string> = {
  ALREADY_FORWARDED: 'not_forwardable', NO_ACTIVE_FORWARD: 'no_active_forward', NOT_RESENDABLE: 'not_resendable', CODE_EXPOSED: 'code_exposed',
}

async function ctx(req: Request) {
  const sess = await requireSession(req)
  const body = await readJson<Body>(req)
  if (typeof body.clientRequestId !== 'string' || body.clientRequestId.length < 8 || body.clientRequestId.length > 64) {
    throw new ApiError('VALIDATION', { field: 'clientRequestId' })
  }
  const v = await loadOwnedVoucher(body.voucherId, sess.recipientId)
  const s = await getSettings()
  return { sess, body, v, s, clientRequestId: body.clientRequestId }
}

async function replay(clientRequestId: string): Promise<ForwardResponse | null> {
  const { data } = await db().from('voucher_forwards').select('id').eq('client_request_id', clientRequestId).maybeSingle()
  return data ? { forwardId: data.id, created: false } : null
}

async function requireAction(v: VoucherRow, s: Settings, action: 'forward' | 'resend' | 'reforward') {
  const li = (await lineInputs([v], s)).get(v.id)!
  if (!lineStatus(li.input).actions.includes(action)) throw new ApiError('CONFLICT', { reason: action === 'forward' ? 'not_forwardable' : 'no_active_forward' })
}

async function apply(params: Record<string, unknown>): Promise<ApplyRow> {
  const { data, error } = await db().rpc('forward_apply', params)
  if (error) {
    const key = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k))
    if (key) throw new ApiError('CONFLICT', { reason: RPC_ERRORS[key] })
    throw new Error(`forward_apply: ${error.message}`)
  }
  return (data as ApplyRow[])[0]
}

// 다시 보내기는 "못 받았어요"에 바로 응해야 하므로 같은 번호 간격(skipGap)을 적용하지 않는다
async function limits(sess: Session, v: VoucherRow, s: Settings, toPhoneHash: string, skipGap = false) {
  const now = new Date()
  const { data } = await db().rpc('forward_counts', {
    p_recipient_id: sess.recipientId, p_voucher_id: v.id, p_to_phone_hash: toPhoneHash, p_day_start: kstDayStart(now).toISOString(),
  })
  const c = (data as { out_voucher_today: number; out_box_today: number; out_last_same_number: string | null; out_unused: number }[])[0]
  const r = checkForwardLimits({
    now, voucherToday: c.out_voucher_today, boxToday: c.out_box_today,
    lastSameNumberAt: !skipGap && c.out_last_same_number ? new Date(c.out_last_same_number) : null, unusedCount: c.out_unused,
    settings: { perVoucherDay: s.forward_resend_per_voucher_day, sameNumberGapMin: s.forward_same_number_gap_min, perBoxDayMin: s.forward_per_box_day_min },
  })
  if (!r.ok) throw new ApiError('LIMIT_EXCEEDED', { reason: r.reason, retryAt: r.retryAt.toISOString() })
}

async function orReplay(clientRequestId: string, fn: () => Promise<ApplyRow>): Promise<ApplyRow | ForwardResponse> {
  try {
    return await fn()
  } catch (e) {
    const again = await replay(clientRequestId)
    if (again) return again
    throw e
  }
}

async function senderMasked(recipientId: string): Promise<string> {
  const { data } = await db().from('recipients').select('name_masked').eq('id', recipientId).single()
  return data?.name_masked ?? ''
}

export async function forwardCreate(req: Request): Promise<Response> {
  const { sess, body, v, s, clientRequestId } = await ctx(req)
  const done = await replay(clientRequestId)
  if (done) return json(200, done)

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 1 || name.length > 20) throw new ApiError('VALIDATION', { field: 'name' })
  const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null
  if (!phone) throw new ApiError('VALIDATION', { field: 'phone' })
  const toHash = await phoneHash(phone)
  const { data: rec } = await db().from('recipients').select('phone_hash').eq('id', sess.recipientId).single()
  const isSelf = rec?.phone_hash === toHash

  const token = randomToken(32)
  // 같은 요청 ID가 동시에 두 번 오면, 늦은 쪽은 상태 검사·함수에서 막힌다. 그때 먼저 처리된 결과를 돌려준다.
  const row = await orReplay(clientRequestId, async () => {
    await requireAction(v, s, 'forward')
    if (isSelf && body.confirmSelf !== true) throw new ApiError('CONFLICT', { reason: 'self_number' })
    await limits(sess, v, s, toHash)
    return await apply({
    p_action: 'forward', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
    p_token_hash: await hmac(`forward:${token}`), p_link_ttl_days: s.forward_link_ttl_days,
    p_to_name_enc: await encrypt('A', name), p_to_name_masked: maskName(name),
    p_to_phone_enc: await encrypt('A', phone), p_to_phone_hash: toHash, p_to_phone_last4: last4(phone), p_is_self: isSelf,
    })
  })
  if ('forwardId' in row) return json(200, row)
  if (row.out_created) {
    await sendForwardMessage(row.out_forward_id, token, await senderMasked(sess.recipientId), s)
    await logEvent('forward_sent', { recipientId: sess.recipientId, voucherId: v.id, orderId: v.order_id })
  }
  const res: ForwardResponse = { forwardId: row.out_forward_id, created: row.out_created }
  return json(200, res)
}

export async function forwardResend(req: Request): Promise<Response> {
  const { sess, v, s, clientRequestId } = await ctx(req)
  const done = await replay(clientRequestId)
  if (done) return json(200, done)
  await requireAction(v, s, 'resend')
  await limits(sess, v, s, '', true)
  const token = randomToken(32)
  const row = await apply({
    p_action: 'resend', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
    p_token_hash: await hmac(`forward:${token}`), p_link_ttl_days: s.forward_link_ttl_days,
  })
  if (row.out_created) {
    await sendForwardMessage(row.out_forward_id, token, await senderMasked(sess.recipientId), s)
    await logEvent('forward_sent', { recipientId: sess.recipientId, voucherId: v.id, props: { resend: true } })
  }
  return json(200, { forwardId: row.out_forward_id, created: row.out_created } satisfies ForwardResponse)
}

export async function forwardCancel(req: Request): Promise<Response> {
  const { sess, v, s, clientRequestId } = await ctx(req)
  const done = await replay(clientRequestId)
  if (done) return json(200, done)
  await requireAction(v, s, 'resend') // 전달 중인 줄인지 (다른 분께 가능 여부는 함수가 코드 노출로 판정)
  const row = await apply({
    p_action: 'cancel', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
    p_token_hash: await hmac(`forward:${randomToken(32)}`), p_link_ttl_days: s.forward_link_ttl_days,
  })
  await logEvent('forward_cancelled', { recipientId: sess.recipientId, voucherId: v.id })
  return json(200, { forwardId: row.out_forward_id, created: row.out_created } satisfies ForwardResponse)
}

export async function forwardDirect(req: Request): Promise<Response> {
  const { sess, v, s, clientRequestId } = await ctx(req)
  await requireAction(v, s, 'forward')
  const token = randomToken(32)
  await apply({
    p_action: 'direct_share', p_voucher_id: v.id, p_client_request_id: clientRequestId, p_actor_type: 'recipient',
    p_token_hash: await hmac(`forward:${token}`), p_link_ttl_days: s.forward_link_ttl_days,
  })
  await logEvent('direct_share', { recipientId: sess.recipientId, voucherId: v.id })
  const url = `${publicBase()}/f/${token}`
  const res: DirectShareResponse = { url, text: t('forward.direct.text', { sender: await senderMasked(sess.recipientId), url }) }
  return json(200, res)
}
```

직접 공유는 같은 요청 ID로 다시 부르면 토큰을 다시 만들 수 없으므로(원문을 저장하지 않는다) `CONFLICT { reason: 'not_forwardable' }`가 난다. 화면은 직접 공유 버튼을 누를 때마다 새 요청 ID를 쓴다.

`router.ts`: `import { forwardCancel, forwardCreate, forwardDirect, forwardResend } from './handlers/forward.ts'` 그리고

```ts
  'POST forward/create': forwardCreate,
  'POST forward/resend': forwardResend,
  'POST forward/cancel': forwardCancel,
  'POST forward/direct': forwardDirect,
```

- [ ] **Step 5: 실행** — `deno task db:reset` → `deno task test:api` → PASS (전체)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/api tests/api/forward.test.ts
git commit -m "feat(api): 전달·다시 보내기·다른 분께·직접 공유, 한도와 연타 방지"
```

---

### Task 15: 화면 공통 (API 호출·브랜드·상태 화면) + 진입·OTP 화면

**Files:**
- Create: `web/src/lib/api.ts`, `web/src/lib/useCountdown.ts`, `web/src/components/Wordmark.tsx`, `web/src/pages/StatePage.tsx`, `web/src/pages/EntryPage.tsx`, `web/src/lib/api.test.ts`
- Modify: `web/src/App.tsx`, `web/src/pages/Placeholder.tsx`

**Interfaces:**
- Consumes: `@core/apiTypes.ts`, `@core/copy.ko.ts`, `@core/time.ts`
- Produces:
  - `class ApiError extends Error { code: ErrorCode; status: number; extra: Record<string, unknown> }`
  - `api<T>(path: string, body?: unknown): Promise<T>` (body가 없으면 GET)
  - `useCountdown(targetIso: string | null): number` (남은 초)
  - `<Wordmark size?: 'sm' | 'lg' />`, `<StatePage kind: 'notFound' | 'linkInvalid' | 'linkRevoked' | 'sessionExpired' | 'blocked' | 'error' | 'maintenance' />`
  - 경로 `/`, `/:token`

- [ ] **Step 1: 실패하는 테스트**

`web/src/lib/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => vi.restoreAllMocks())

describe('api', () => {
  it('성공하면 JSON을 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    expect(await api<{ ok: boolean }>('box')).toEqual({ ok: true })
  })
  it('오류면 ApiError(code, extra)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'OTP_WRONG', extra: { remaining: 2 } } }), { status: 400 })))
    await expect(api('otp/verify', { code: '000000' })).rejects.toMatchObject({ code: 'OTP_WRONG', status: 400, extra: { remaining: 2 } })
  })
  it('JSON이 아닌 응답은 UPSTREAM_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })))
    const e = await api('box').catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.code).toBe('UPSTREAM_FAILED')
  })
})
```

- [ ] **Step 2: 실패 확인** — `cd web && npm test` → FAIL (`./api` 없음)

- [ ] **Step 3: 구현**

`web/src/lib/api.ts`:

```ts
import type { ErrorCode } from '@core/apiTypes.ts'

export class ApiError extends Error {
  code: ErrorCode
  status: number
  extra: Record<string, unknown>
  constructor(code: ErrorCode, status: number, extra: Record<string, unknown> = {}) {
    super(code)
    this.code = code
    this.status = status
    this.extra = extra
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const text = await res.text()
  let data: unknown = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError('UPSTREAM_FAILED', res.status)
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: ErrorCode; extra?: Record<string, unknown> } }).error
    throw new ApiError(e?.code ?? 'UPSTREAM_FAILED', res.status, e?.extra ?? {})
  }
  return data as T
}
```

`web/src/lib/useCountdown.ts`:

```ts
import { useEffect, useState } from 'react'

export function useCountdown(targetIso: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!targetIso) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetIso])
  return targetIso ? Math.max(0, Math.ceil((Date.parse(targetIso) - now) / 1000)) : 0
}
```

`web/src/components/Wordmark.tsx`:

```tsx
import { Box, Stack, Typography } from '@mui/material'
import { t } from '@core/copy.ko.ts'
import { tokens } from '../theme/seorap'

export default function Wordmark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const img = size === 'lg' ? 120 : 40
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box component="img" src={tokens.logo.src} alt={tokens.logo.alt} sx={{ width: img, height: img }} />
      <Stack>
        <Typography variant="caption" color="text.secondary">{t('brand.parent')}</Typography>
        <Typography variant={size === 'lg' ? 'h4' : 'h6'} sx={{ color: tokens.seorapAccent, lineHeight: 1.1 }}>{t('brand.name')}</Typography>
      </Stack>
    </Stack>
  )
}
```

`web/src/pages/StatePage.tsx`:

```tsx
import { Box, Stack, Typography } from '@mui/material'
import { type CopyKey, t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'

export type StateKind = 'notFound' | 'linkInvalid' | 'linkRevoked' | 'sessionExpired' | 'blocked' | 'error' | 'maintenance'
const KEY: Record<StateKind, CopyKey> = {
  notFound: 'state.notFound', linkInvalid: 'state.linkInvalid', linkRevoked: 'state.linkRevoked',
  sessionExpired: 'state.sessionExpired', blocked: 'state.blocked', error: 'error.generic', maintenance: 'maintenance',
}

export default function StatePage({ kind }: { kind: StateKind }) {
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Stack spacing={3} sx={{ alignItems: 'center', maxWidth: 480, textAlign: 'center' }}>
        <Wordmark size="lg" />
        <Typography variant="body1" color="text.secondary">{t(KEY[kind])}</Typography>
      </Stack>
    </Box>
  )
}
```

`web/src/pages/Placeholder.tsx` 전체를 바꾼다(문구를 사전으로):

```tsx
import { Box, Stack, Typography } from '@mui/material'
import { t } from '@core/copy.ko.ts'
import Wordmark from '../components/Wordmark'

export default function Placeholder() {
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Stack spacing={3} sx={{ alignItems: 'center', maxWidth: 480, textAlign: 'center' }}>
        <Wordmark size="lg" />
        <Typography variant="body1" color="text.secondary">{t('placeholder.preparing')}</Typography>
      </Stack>
    </Box>
  )
}
```

`web/src/pages/EntryPage.tsx`:

```tsx
import { Alert, Box, Button, Collapse, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { EntryResponse, OtpRequestResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import { formatKstDateTime } from '@core/time.ts'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import { useCountdown } from '../lib/useCountdown'
import StatePage, { type StateKind } from './StatePage'

const TOKEN_RE = /^[A-Za-z0-9]{32}$/
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return t('error.generic')
  if (e.code === 'OTP_WRONG') return t('otp.wrong', { n: Number(e.extra.remaining ?? 0) })
  if (e.code === 'OTP_EXPIRED') return t('otp.expired')
  if (e.code === 'OTP_LOCKED') return t('otp.locked', { time: formatKstDateTime(String(e.extra.until)) })
  if (e.code === 'RATE_LIMITED') return t('otp.rateLimited', { time: formatKstDateTime(String(e.extra.retryAt)) })
  return t('error.generic')
}

export default function EntryPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const valid = TOKEN_RE.test(token)
  const [entry, setEntry] = useState<EntryResponse | null>(null)
  const [fatal, setFatal] = useState<StateKind | null>(null)
  const [otp, setOtp] = useState<OtpRequestResponse | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)
  const left = useCountdown(otp?.expiresAt ?? null)
  const resendLeft = useCountdown(otp?.resendAt ?? null)

  useEffect(() => {
    if (!valid) return
    api<EntryResponse>('entry', { token })
      .then(setEntry)
      .catch((e) => {
        const c = e instanceof ApiError ? e.code : null
        setFatal(c === 'LINK_INVALID' ? 'linkInvalid' : c === 'LINK_REVOKED' ? 'linkRevoked' : c === 'FORBIDDEN' ? 'blocked' : 'error')
      })
  }, [token, valid])

  if (!valid) return <StatePage kind="notFound" />
  if (fatal) return <StatePage kind={fatal} />
  if (!entry) return null

  const requestOtp = async () => {
    setBusy(true); setMessage(null)
    try { setOtp(await api<OtpRequestResponse>('otp/request', { token })); setCode('') }
    catch (e) { setMessage(errorText(e)) }
    finally { setBusy(false) }
  }
  const verify = async () => {
    setBusy(true); setMessage(null)
    try { await api('otp/verify', { token, code }); navigate('/box', { replace: true }) }
    catch (e) { setMessage(errorText(e)) }
    finally { setBusy(false) }
  }

  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 4 }}>
      <Stack spacing={3}>
        <Wordmark />
        {entry.noticeBanner && <Alert severity="info">{entry.noticeBanner}</Alert>}
        <Typography variant="h5">{t('entry.title', { name: entry.nameMasked })}</Typography>
        {!otp ? (
          <>
            <Typography variant="body1">{t('entry.send', { phone: entry.phoneMasked })}</Typography>
            <Button variant="contained" size="large" disabled={busy} onClick={requestOtp}>{t('entry.button')}</Button>
            <Typography variant="caption" color="text.secondary">{t('entry.notice')}</Typography>
          </>
        ) : (
          <>
            <Typography variant="body1">{t('otp.title')}</Typography>
            <TextField
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6, 'aria-label': t('otp.title') } }}
              autoFocus
            />
            <Typography variant="body2" color="text.secondary">{t('otp.remaining', { time: mmss(left) })}</Typography>
            <Button variant="contained" size="large" disabled={busy || code.length !== 6} onClick={verify}>{t('otp.submit')}</Button>
            <Stack direction="row" spacing={1}>
              <Button variant="text" disabled={busy || resendLeft > 0} onClick={requestOtp}>{t('otp.resend')}</Button>
              <Button variant="text" onClick={() => setHelp((v) => !v)}>{t('otp.noSms')}</Button>
            </Stack>
            <Collapse in={help}><Typography variant="body2" color="text.secondary">{t('otp.noSms.help')}</Typography></Collapse>
          </>
        )}
        {message && <Alert severity="warning">{message}</Alert>}
      </Stack>
    </Box>
  )
}
```

`web/src/App.tsx` 전체:

```tsx
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import EntryPage from './pages/EntryPage'
import Placeholder from './pages/Placeholder'
import StatePage from './pages/StatePage'

const BoxPage = lazy(() => import('./pages/BoxPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const DevOutboxPage = lazy(() => import('./pages/DevOutboxPage'))
const isProd = import.meta.env.VITE_SEORAP_ENV === 'production'

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Placeholder />} />
        <Route path="/box" element={<BoxPage />} />
        <Route path="/box/history" element={<HistoryPage />} />
        {!isProd && <Route path="/dev/outbox" element={<DevOutboxPage />} />}
        <Route path="/:token" element={<EntryPage />} />
        <Route path="*" element={<StatePage kind="notFound" />} />
      </Routes>
    </Suspense>
  )
}
```

(BoxPage·HistoryPage·DevOutboxPage는 Task 16~18에서 만든다. 이 Task에서 빌드가 깨지지 않게, 세 파일을 우선 `export default function X() { return null }` 한 줄짜리로 만들어 둔다)

- [ ] **Step 4: 통과·빌드 확인**

Run: `cd web && npm test && npm run build && npm run lint`
Expected: PASS 3 tests, 빌드 성공, 린트 오류 0

- [ ] **Step 5: 손으로 확인**

`deno task fn:serve`가 켜진 상태에서 `cd web && npm run dev` → 브라우저 `http://localhost:5173/seedS1` + `'0'×26` (= `seedS100000000000000000000000000`) → "홍*동님의 서랍이에요", [인증번호 받기] → `http://localhost:5173/dev/outbox`(Task 18 전이면 Studio의 `app.dev_outbox`)에서 번호 확인 → 입력 → `/box`로 이동하고 주소창에 토큰이 없다

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): API 호출·브랜드·상태 화면, 진입·OTP 화면"
```

---

### Task 16: 서랍 화면 (1매 줄·실시하기·코드 보기)

**Files:**
- Create: `web/src/components/LineRow.tsx`, `web/src/components/ConfirmDialog.tsx`, `web/src/components/LineRow.test.tsx`
- Modify: `web/src/pages/BoxPage.tsx` (Task 15의 한 줄짜리를 대체)

**Interfaces:**
- Consumes: `BoxResponse`, `BoxLine`, `LineAction`, `api`, `ApiError`, `t`, `formatKstDate`
- Produces:
  - `<LineRow line={BoxLine} onAction={(a: LineAction | 'code', line: BoxLine) => void} />` (버튼은 `line.status.actions` 순서대로, `launch`·`continue`가 있으면 "코드 보기" 글자 버튼)
  - `<ConfirmDialog open title? message confirmLabel cancelLabel onConfirm onCancel />`
  - `BoxPage`가 `ForwardSheet`(Task 17)를 연다: `onForward(line)`, `onResend(line)`, `onReforward(line)`

- [ ] **Step 1: 실패하는 테스트**

`web/src/components/LineRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BoxLine } from '@core/apiTypes.ts'
import LineRow from './LineRow'

const line = (o: Partial<BoxLine> = {}): BoxLine => ({
  voucherId: 'v1', testItemId: 'T', testName: 'STS 성인 기질검사', unitNo: 1, unitsOfTest: 2, firstLaunchedAt: null, forwardTo: null,
  status: { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] }, ...o,
})

describe('LineRow', () => {
  it('검사명·순번·상태와 상태가 허용한 버튼만 보인다', () => {
    render(<LineRow line={line()} onAction={() => {}} />)
    expect(screen.getByText('STS 성인 기질검사')).toBeTruthy()
    expect(screen.getByText('2매 중 1번째')).toBeTruthy()
    expect(screen.getByText('실시 전')).toBeTruthy()
    expect(screen.getByRole('button', { name: '실시하기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '전달하기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 보내기' })).toBeNull()
  })
  it('1매뿐이면 순번을 보이지 않는다', () => {
    render(<LineRow line={line({ unitsOfTest: 1 })} onAction={() => {}} />)
    expect(screen.queryByText('1매 중 1번째')).toBeNull()
  })
  it('버튼을 누르면 해당 동작으로 부른다', async () => {
    const onAction = vi.fn()
    render(<LineRow line={line()} onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: '전달하기' }))
    expect(onAction).toHaveBeenCalledWith('forward', expect.objectContaining({ voucherId: 'v1' }))
  })
  it('전달한 줄은 받는 분 이름·번호를 보여 준다', () => {
    render(<LineRow line={line({ forwardTo: { name: '김영희', phone: '010-2222-3333' }, status: { label: '전달함 · 김영희', tone: 'info', actions: ['resend'], note: '받는 분이 열어 봄' } })} onAction={() => {}} />)
    expect(screen.getByText('→ 김영희 · 010-2222-3333')).toBeTruthy()
    expect(screen.getByText('받는 분이 열어 봄')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 실패 확인** — `cd web && npm test` → FAIL

- [ ] **Step 3: 구현**

`web/src/components/LineRow.tsx`:

```tsx
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { BoxLine } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import type { LineAction, LineTone } from '@core/lineStatus.ts'

const CHIP: Record<LineTone, 'default' | 'info' | 'success' | 'warning'> = {
  neutral: 'default', info: 'info', success: 'success', warning: 'warning', muted: 'default',
}

export default function LineRow({ line, onAction }: { line: BoxLine; onAction: (a: LineAction | 'code', line: BoxLine) => void }) {
  const canCode = line.status.actions.includes('launch') || line.status.actions.includes('continue')
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, bgcolor: 'background.paper' }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>{line.testName}</Typography>
            {line.unitsOfTest > 1 && (
              <Typography variant="body2" color="text.secondary">{t('line.unit', { n: line.unitsOfTest, k: line.unitNo })}</Typography>
            )}
          </Box>
          <Chip size="small" label={line.status.label} color={CHIP[line.status.tone]} variant={line.status.tone === 'muted' ? 'outlined' : 'filled'} />
        </Stack>
        {line.forwardTo && <Typography variant="body2" color="primary">{`→ ${line.forwardTo.name} · ${line.forwardTo.phone}`}</Typography>}
        {line.status.note && <Typography variant="body2" color="text.secondary">{line.status.note}</Typography>}
        {line.status.actions.length > 0 && (
          <Stack direction="row" spacing={1}>
            {line.status.actions.map((a, i) => (
              <Button key={a} fullWidth variant={i === line.status.actions.length - 1 && a !== 'contact' ? 'contained' : 'outlined'} onClick={() => onAction(a, line)}>
                {t(`action.${a}` as CopyKey)}
              </Button>
            ))}
          </Stack>
        )}
        {canCode && (
          <Button variant="text" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => onAction('code', line)}>{t('action.code')}</Button>
        )}
      </Stack>
    </Box>
  )
}
```

`web/src/components/ConfirmDialog.tsx`:

```tsx
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

// 바깥을 누르거나 뒤로 가기를 하면 onDismiss(기본은 onCancel). 두 버튼이 모두 "실행"인 창은 onDismiss 를 따로 준다.
export default function ConfirmDialog(p: {
  open: boolean; title?: string; message: string; confirmLabel: string; cancelLabel: string
  onConfirm: () => void; onCancel: () => void; onDismiss?: () => void
}) {
  return (
    <Dialog open={p.open} onClose={p.onDismiss ?? p.onCancel} fullWidth maxWidth="xs">
      {p.title && <DialogTitle>{p.title}</DialogTitle>}
      <DialogContent><Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>{p.message}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={p.onCancel}>{p.cancelLabel}</Button>
        <Button variant="contained" onClick={p.onConfirm}>{p.confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  )
}
```

`web/src/pages/BoxPage.tsx`:

```tsx
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BoxGroup, BoxLine, BoxResponse, CodeResponse, ForwardResponse, LaunchResponse } from '@core/apiTypes.ts'
import { t } from '@core/copy.ko.ts'
import type { LineAction } from '@core/lineStatus.ts'
import { formatKstDate } from '@core/time.ts'
import ConfirmDialog from '../components/ConfirmDialog'
import ForwardSheet from '../components/ForwardSheet'
import LineRow from '../components/LineRow'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import StatePage from './StatePage'

type Pending =
  | { kind: 'choose'; line: BoxLine; sibling: BoxLine }
  | { kind: 'code'; code: string }
  | { kind: 'resend'; line: BoxLine }
  | { kind: 'reforward'; line: BoxLine }
  | null

export default function BoxPage() {
  const navigate = useNavigate()
  const [box, setBox] = useState<BoxResponse | null>(null)
  const [expired, setExpired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [sheetLine, setSheetLine] = useState<BoxLine | null>(null)

  const load = useCallback(async () => {
    try { setBox(await api<BoxResponse>('box')) }
    catch (e) { if (e instanceof ApiError && e.status === 401) setExpired(true); else setMessage(t('error.generic')) }
  }, [])
  useEffect(() => { void load() }, [load])

  // 세션이 끝난 채로 무엇을 누르든 "다시 인증" 화면으로 (Review Focus 3)
  const guard = async (fn: () => Promise<void>) => {
    setMessage(null)
    try { await fn() }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { setExpired(true); return }
      if (e instanceof ApiError && e.extra.reason === 'code_exposed') { setMessage(t('forward.exposed')); return }
      setMessage(t('error.generic'))
    }
  }

  const launch = (voucherId: string) => guard(async () => {
    const r = await api<LaunchResponse>('voucher/launch', { voucherId })
    window.location.assign(r.url)
  })

  const onAction = (a: LineAction | 'code', line: BoxLine, group: BoxGroup) => {
    if (a === 'launch' || a === 'continue') {
      const sibling = group.lines.find((l) => l.testItemId === line.testItemId && l.voucherId !== line.voucherId && l.firstLaunchedAt && l.status.actions.includes('continue'))
      if (a === 'launch' && sibling) { setPending({ kind: 'choose', line, sibling }); return }
      void launch(line.voucherId)
    } else if (a === 'code') {
      void guard(async () => setPending({ kind: 'code', code: (await api<CodeResponse>('voucher/code', { voucherId: line.voucherId })).code }))
    } else if (a === 'forward') setSheetLine(line)
    else if (a === 'resend') setPending({ kind: 'resend', line })
    else if (a === 'reforward') setPending({ kind: 'reforward', line })
  }

  const logout = () => guard(async () => { await api('logout', {}); navigate('/', { replace: true }) })

  if (expired) return <StatePage kind="sessionExpired" />
  if (!box) return message ? <StatePage kind="error" /> : null

  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark />
          <Button variant="text" onClick={logout}>{t('box.logout')}</Button>
        </Stack>
        {box.noticeBanner && <Alert severity="info">{box.noticeBanner}</Alert>}
        <Typography variant="h5">{t('box.title', { name: box.ownerName })}</Typography>
        <Typography variant="body2" color="text.secondary">{t('box.summary', { n: box.notStartedCount })}</Typography>
        <Tabs value={0} onChange={(_, v) => v === 1 && navigate('/box/history')}>
          <Tab label={t('box.tab.mine')} />
          <Tab label={t('box.tab.history')} />
        </Tabs>
        {message && <Alert severity="warning">{message}</Alert>}
        {box.groups.length === 0 && <Typography variant="body1" color="text.secondary">{t('box.empty')}</Typography>}
        {box.groups.map((g) => (
          <Accordion key={g.orderId} defaultExpanded={!g.done} disableGutters>
            <AccordionSummary>
              <Typography variant="body2" color="text.secondary">
                {g.lineCount > 1
                  ? t('box.group', { date: formatKstDate(g.purchasedAt), product: g.productName, n: g.lineCount })
                  : t('box.groupSingle', { date: formatKstDate(g.purchasedAt), product: g.productName })}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {g.lines.map((l) => <LineRow key={l.voucherId} line={l} onAction={(a, line) => onAction(a, line, g)} />)}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>

      <ConfirmDialog
        open={pending?.kind === 'choose'}
        message={t('launch.choose')}
        confirmLabel={t('launch.continue')}
        cancelLabel={t('launch.new')}
        onConfirm={() => { if (pending?.kind === 'choose') void launch(pending.sibling.voucherId); setPending(null) }}
        onCancel={() => { if (pending?.kind === 'choose') void launch(pending.line.voucherId); setPending(null) }}
        onDismiss={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'code'}
        title={t('code.title')}
        message={pending?.kind === 'code' ? `${pending.code}\n${t('code.pcNote')}` : ''}
        confirmLabel={t('common.close')}
        cancelLabel={t('common.close')}
        onConfirm={() => setPending(null)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'resend'}
        message={pending?.kind === 'resend' ? t('forward.resend.confirm', { name: pending.line.forwardTo?.name ?? '' }) : ''}
        confirmLabel={t('forward.send')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (pending?.kind !== 'resend') return
          const line = pending.line
          setPending(null)
          void guard(async () => { await api<ForwardResponse>('forward/resend', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID() }); await load() })
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'reforward'}
        message={pending?.kind === 'reforward' ? t('forward.reforward.confirm', { name: pending.line.forwardTo?.name ?? '' }) : ''}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (pending?.kind !== 'reforward') return
          const line = pending.line
          setPending(null)
          void guard(async () => {
            await api<ForwardResponse>('forward/cancel', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID() })
            await load()
            setSheetLine({ ...line, forwardTo: null })
          })
        }}
        onCancel={() => setPending(null)}
      />
      <ForwardSheet line={sheetLine} onClose={() => setSheetLine(null)} onDone={async () => { setSheetLine(null); await load() }} onExpired={() => setExpired(true)} />
    </Box>
  )
}
```

(이 Task에서는 `ForwardSheet`가 아직 없으므로, `web/src/components/ForwardSheet.tsx`를 `export default function ForwardSheet(_: { line: unknown; onClose: () => void; onDone: () => void; onExpired: () => void }) { return null }`로 임시로 만들어 빌드를 통과시킨다. Task 17에서 대체한다)

- [ ] **Step 4: 통과·빌드** — `cd web && npm test && npm run build && npm run lint` → PASS

- [ ] **Step 5: 손으로 확인** — S1으로 들어가 3줄(영유아 "실시함", 성인 1번째 [실시하기][전달하기], 성인 2번째 "전달함 · 김영희"), 아래 S3 묶음은 접혀 있음. 성인 1번째 [실시하기] → 브라우저가 `https://inpsyt.co.kr/inpsyt/testing/TEST-…`로 이동

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): 서랍 화면, 1매 줄, 실시하기·코드 보기·다시 보내기·다른 분께"
```

---

### Task 17: 전달 시트 (입력·확인·본인 번호·한도·직접 공유)

**Files:**
- Create: `web/src/components/ForwardSheet.test.tsx`
- Modify: `web/src/components/ForwardSheet.tsx` (임시본 대체)

**Interfaces:**
- Consumes: `formatPhoneInput`, `normalizePhone`, `isNightKst`, `formatKstDateTime`, `api`, `ApiError`, `t`
- Produces: `<ForwardSheet line={BoxLine | null} onClose onDone onExpired />` (line이 null이면 닫힘). 단계: `input` → `confirm` → (본인 번호면 `self`) → 보내기. 시트를 열 때 요청 ID 1개를 만들어 연타에도 같은 ID를 쓴다

- [ ] **Step 1: 실패하는 테스트**

`web/src/components/ForwardSheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoxLine } from '@core/apiTypes.ts'
import ForwardSheet from './ForwardSheet'

const line: BoxLine = {
  voucherId: 'v1', testItemId: 'T', testName: 'STS 성인 기질검사', unitNo: 2, unitsOfTest: 2, firstLaunchedAt: null, forwardTo: null,
  status: { label: '실시 전', tone: 'neutral', actions: ['launch', 'forward'] },
}
afterEach(() => vi.restoreAllMocks())

describe('ForwardSheet', () => {
  it('잘못된 번호면 다음으로 넘어가지 않고 서버를 부르지 않는다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ForwardSheet line={line} onClose={() => {}} onDone={() => {}} onExpired={() => {}} />)
    await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
    await userEvent.type(screen.getByLabelText('휴대폰 번호'), '02-123-4567')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('휴대폰 번호를 확인해 주세요 (예: 010-1234-5678)')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('번호는 입력 중 자동 하이픈, 확인 화면에 크게 다시 보인다', async () => {
    render(<ForwardSheet line={line} onClose={() => {}} onDone={() => {}} onExpired={() => {}} />)
    await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
    await userEvent.type(screen.getByLabelText('휴대폰 번호'), '01012345678')
    expect((screen.getByLabelText('휴대폰 번호') as HTMLInputElement).value).toBe('010-1234-5678')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('이 번호가 맞나요?')).toBeTruthy()
    expect(screen.getByText('010-1234-5678')).toBeTruthy()
  })

  it('보내기를 두 번 눌러도 같은 요청 ID로 간다', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body))
      return new Response(JSON.stringify({ forwardId: 'f1', created: true }), { status: 200 })
    }))
    render(<ForwardSheet line={line} onClose={() => {}} onDone={() => {}} onExpired={() => {}} />)
    await userEvent.type(screen.getByLabelText('이름 또는 호칭'), '홍길동')
    await userEvent.type(screen.getByLabelText('휴대폰 번호'), '01012345678')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    const send = screen.getByRole('button', { name: '보내기' })
    await userEvent.click(send)
    await userEvent.click(send)
    const ids = bodies.map((b) => JSON.parse(b).clientRequestId)
    expect(new Set(ids).size).toBe(1)
  })
})
```

- [ ] **Step 2: 실패 확인** — `cd web && npm test` → FAIL

- [ ] **Step 3: 구현**

`web/src/components/ForwardSheet.tsx`:

```tsx
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Drawer, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { BoxLine, DirectShareResponse, ForwardResponse } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import { formatPhoneInput, normalizePhone } from '@core/phone.ts'
import { formatKstDateTime, isNightKst } from '@core/time.ts'
import { api, ApiError } from '../lib/api'

type Step = 'input' | 'confirm' | 'self'

export default function ForwardSheet({ line, onClose, onDone, onExpired }: {
  line: BoxLine | null; onClose: () => void; onDone: () => void | Promise<void>; onExpired: () => void
}) {
  const [step, setStep] = useState<Step>('input')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestId = useMemo(() => (line ? crypto.randomUUID() : ''), [line])

  useEffect(() => { setStep('input'); setName(''); setPhone(''); setError(null); setInfo(null) }, [line])
  if (!line) return null

  const next = () => {
    const n = name.trim()
    if (n.length < 1 || n.length > 20) { setError(t('forward.invalidName')); return }
    if (!normalizePhone(phone)) { setError(t('forward.invalidPhone')); return }
    setError(null); setStep('confirm')
  }

  const send = async (confirmSelf: boolean) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await api<ForwardResponse>('forward/create', { voucherId: line.voucherId, name: name.trim(), phone, clientRequestId: requestId, confirmSelf })
      setInfo(t('forward.sent', { name: name.trim() }))
      await onDone()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { onExpired(); return }
      if (e instanceof ApiError && e.extra.reason === 'self_number') { setStep('self'); return }
      if (e instanceof ApiError && e.code === 'LIMIT_EXCEEDED') {
        setError(t(`limit.${String(e.extra.reason)}` as CopyKey, { time: formatKstDateTime(String(e.extra.retryAt)) })); return
      }
      if (e instanceof ApiError && e.code === 'VALIDATION') { setError(e.extra.field === 'name' ? t('forward.invalidName') : t('forward.invalidPhone')); setStep('input'); return }
      setError(t('error.generic'))
    } finally { setBusy(false) }
  }

  const direct = async () => {
    setBusy(true); setError(null)
    try {
      const r = await api<DirectShareResponse>('forward/direct', { voucherId: line.voucherId, clientRequestId: crypto.randomUUID() })
      try { await navigator.clipboard.writeText(r.text); setInfo(t('forward.direct.copied')) }
      catch { setInfo(r.text) } // 복사가 막힌 환경이면 문구를 보여 주고 직접 길게 눌러 복사
      await onDone()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { onExpired(); return }
      setError(t('error.generic'))
    } finally { setBusy(false) }
  }

  return (
    <Drawer anchor="bottom" open={!!line} onClose={onClose} slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}>
      <Box sx={{ maxWidth: 480, mx: 'auto', width: '100%', px: 2, py: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('forward.title', { test: line.testName })}</Typography>
          {step === 'input' && (
            <>
              <TextField label={t('forward.name')} value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 20 } }} />
              <TextField label={t('forward.phone')} value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} slotProps={{ htmlInput: { inputMode: 'tel' } }} />
              <Typography variant="body2" color="text.secondary">{t('forward.child')}</Typography>
              {isNightKst(new Date()) && <Alert severity="info">{t('forward.night')}</Alert>}
              <Button variant="contained" size="large" onClick={next}>{t('forward.next')}</Button>
              <Accordion disableGutters elevation={0}>
                <AccordionSummary><Typography variant="body2">{t('forward.more')}</Typography></AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">{t('forward.direct.warn')}</Typography>
                    <Button variant="outlined" disabled={busy} onClick={direct}>{t('forward.direct')}</Button>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Typography variant="body1">{t('forward.confirm')}</Typography>
              <Typography variant="h5">{name.trim()}</Typography>
              <Typography variant="h5">{phone}</Typography>
              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" onClick={() => setStep('input')}>{t('forward.edit')}</Button>
                <Button fullWidth variant="contained" disabled={busy} onClick={() => send(false)}>{t('forward.send')}</Button>
              </Stack>
            </>
          )}
          {step === 'self' && (
            <>
              <Typography variant="body1">{t('forward.self')}</Typography>
              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" onClick={onClose}>{t('common.cancel')}</Button>
                <Button fullWidth variant="contained" disabled={busy} onClick={() => send(true)}>{t('forward.selfSend')}</Button>
              </Stack>
            </>
          )}
          {error && <Alert severity="warning">{error}</Alert>}
          {info && <Alert severity="success">{info}</Alert>}
        </Stack>
      </Box>
    </Drawer>
  )
}
```

`busy` 상태로 막아도, 상태가 바뀌기 전에 두 번째 클릭이 들어오면 같은 `requestId`로 두 번 부를 수 있다. 서버가 같은 ID를 한 번만 처리하므로(Task 14) 결과는 하나다. 테스트는 이 "같은 ID"를 확인한다.

- [ ] **Step 4: 통과·빌드** — `cd web && npm test && npm run build && npm run lint` → PASS

- [ ] **Step 5: 손으로 확인** — S1 성인 1번째 [전달하기] → 이름 "이몽룡", 번호 `01098765432` → [다음] → 확인 화면 → [보내기] → 줄이 "전달함 · 이몽룡", 주소 아래 "→ 이몽룡 · 010-9876-5432"

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ForwardSheet.tsx web/src/components/ForwardSheet.test.tsx
git commit -m "feat(web): 전달 시트 (확인 화면·본인 번호·한도·직접 공유)"
```

---

### Task 18: 전달 이력 화면 + 가짜 발신함 화면

**Files:**
- Modify: `web/src/pages/HistoryPage.tsx`, `web/src/pages/DevOutboxPage.tsx` (임시본 대체)

**Interfaces:**
- Consumes: `HistoryResponse`, `DevOutboxItem`, `api`, `t`, `formatKstDateTime`

- [ ] **Step 1: 전달 이력 화면**

`web/src/pages/HistoryPage.tsx`:

```tsx
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HistoryItem, HistoryResponse } from '@core/apiTypes.ts'
import { type CopyKey, t } from '@core/copy.ko.ts'
import { formatKstDateTime } from '@core/time.ts'
import Wordmark from '../components/Wordmark'
import { api, ApiError } from '../lib/api'
import StatePage from './StatePage'

function lineText(i: HistoryItem): string {
  const at = formatKstDateTime(i.at)
  if (i.action === 'direct_share') return t('history.direct', { at })
  if (i.action === 'cancel') return t('history.cancel', { at, name: i.toName ?? '' })
  const result = i.result ? t(`history.result.${i.result}` as CopyKey) : t('history.result.sending')
  return t('history.line', { name: i.toName ?? '', phone: i.toPhone ?? '', at, result })
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    api<HistoryResponse>('history').then((r) => setItems(r.items)).catch((e) => {
      if (e instanceof ApiError && e.status === 401) setExpired(true)
      else setItems([])
    })
  }, [])

  if (expired) return <StatePage kind="sessionExpired" />
  return (
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={2}>
        <Wordmark />
        <Tabs value={1} onChange={(_, v) => v === 0 && navigate('/box')}>
          <Tab label={t('box.tab.mine')} />
          <Tab label={t('box.tab.history')} />
        </Tabs>
        {items && items.length === 0 && <Typography variant="body1" color="text.secondary">{t('history.empty')}</Typography>}
        {items?.map((i) => (
          <Box key={i.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, bgcolor: 'background.paper' }}>
            <Typography variant="body1">{lineText(i)}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[`${i.testName} ${i.unitNo}`, i.action === 'resend' ? t('history.resendMark') : null, i.openedAt ? t('history.opened') : null].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
```

- [ ] **Step 2: 가짜 발신함 화면 (운영 빌드 제외)**

`web/src/pages/DevOutboxPage.tsx`:

```tsx
import { Box, Button, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import type { DevOutboxItem } from '@core/apiTypes.ts'
import { formatKstDateTime } from '@core/time.ts'
import { api } from '../lib/api'

// 로컬·미리보기 전용. 운영 빌드에서는 App.tsx가 이 경로를 만들지 않는다.
export default function DevOutboxPage() {
  const [items, setItems] = useState<DevOutboxItem[]>([])
  const load = useCallback(() => { void api<{ items: DevOutboxItem[] }>('dev/outbox').then((r) => setItems(r.items)) }, [])
  useEffect(load, [load])
  return (
    <Box component="main" sx={{ maxWidth: 720, mx: 'auto', px: 2, py: 3 }}>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6">dev outbox</Typography>
          <Button onClick={load}>refresh</Button>
        </Stack>
        {items.map((i) => (
          <Box key={i.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            <Typography variant="caption" color="text.secondary">{`${formatKstDateTime(i.createdAt)} · ${i.kind} · ****${i.toLast4}`}</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{i.body}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
```

(개발자 전용 화면이라 문구 사전 규칙의 예외로 둔다. 고객이 보는 화면이 아니다)

- [ ] **Step 3: 빌드** — `cd web && npm test && npm run build && npm run lint` → PASS

- [ ] **Step 4: 손으로 확인** — S8으로 들어가 [전달 이력] 탭 → 3줄: "유관순 / 010-3333-5555 님께 … 검사링크 전달 · 알림톡 전달 완료", "… 이순신님께 보낸 전달을 취소함", "이순신 / 010-1111-2222 님께 …". `/dev/outbox`에 OTP 문자가 보인다

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/HistoryPage.tsx web/src/pages/DevOutboxPage.tsx
git commit -m "feat(web): 전달 이력 화면, 가짜 발신함(개발 전용)"
```

---

### Task 19: 미리보기 환경 배포 (Supabase `seorap-preview` + Vercel)

**Files:**
- Modify: `web/vercel.json` (함수 경로를 `/functions/v1/api/`로)
- Create: `.secrets/preview.env` (커밋 안 함)

**Interfaces:**
- Produces: 미리보기 주소 `https://seorap-olive.vercel.app` (Vercel 보호 켜짐)에서 시드 S1~S8로 진입·OTP·서랍·전달·이력 동작

> 이 Task에는 **김건우가 직접 넣어야 하는 값**이 있다(DB 비밀번호). 에이전트는 비밀값을 화면에 출력하지 않는다.

- [ ] **Step 1: vercel.json 함수 경로 수정**

`web/vercel.json`의 두 `/api/:path*` 규칙의 `destination`을 다음처럼 바꾼다:

```json
"destination": "https://huthfuxytygdbytxrdhf.supabase.co/functions/v1/api/:path*"
```
```json
"destination": "https://wmbjnwmfqoquanrpgiqh.supabase.co/functions/v1/api/:path*"
```

- [ ] **Step 2: 미리보기 DB 비밀번호 준비 (김건우)**

`.env.local`에 한 줄 추가(채팅에 붙이지 않는다): `SUPABASE_PREVIEW_DB_PASSWORD=...` (Supabase 대시보드 → seorap-preview → Database → 비밀번호. 모르면 재설정)

- [ ] **Step 3: 연결과 마이그레이션 반영**

```bash
set -a; . ./.env.local; set +a
supabase link --project-ref wmbjnwmfqoquanrpgiqh --password "$SUPABASE_PREVIEW_DB_PASSWORD"
supabase db push --linked --password "$SUPABASE_PREVIEW_DB_PASSWORD"
```
Expected: 마이그레이션 3개 적용

- [ ] **Step 4: API에 app 스키마 노출**

Run: `supabase config push --project-ref wmbjnwmfqoquanrpgiqh` (config.toml의 `[api] schemas`를 반영)
명령이 안 되면 대시보드 → seorap-preview → Settings → Data API → Exposed schemas에 `app` 추가(김건우 또는 에이전트가 안내)

- [ ] **Step 5: 함수 비밀값과 배포**

```bash
mkdir -p .secrets
deno run scripts/gen-keys.ts preview > .secrets/preview.env
printf 'SEORAP_PUBLIC_BASE=https://seorap-olive.vercel.app\nSEORAP_PLATFORM_TEST_URL=https://inpsyt.co.kr/inpsyt/testing\n' >> .secrets/preview.env
supabase secrets set --env-file .secrets/preview.env --project-ref wmbjnwmfqoquanrpgiqh
supabase functions deploy api --project-ref wmbjnwmfqoquanrpgiqh --no-verify-jwt
```

- [ ] **Step 6: 미리보기 시드**

```bash
export SEED_SUPABASE_URL=https://wmbjnwmfqoquanrpgiqh.supabase.co
export SEED_SERVICE_ROLE_KEY="$(supabase projects api-keys --project-ref wmbjnwmfqoquanrpgiqh -o json | deno eval 'const t=await new Response(Deno.stdin.readable).text(); const a=JSON.parse(t.slice(t.indexOf("["))); console.log(a.find(k=>k.name==="service_role").api_key)')"
SEED_KEYS_FILE=.secrets/preview.env deno run -A scripts/seed.ts
unset SEED_SERVICE_ROLE_KEY
```
Expected: `seed done`

- [ ] **Step 7: Vercel 환경변수 `VITE_SEORAP_ENV`**

Vercel 토큰으로 Production·Preview 둘 다 `preview`로 넣는다(운영 도메인 연결 전까지는 둘 다 테스트용):

```bash
T=$(grep '^VERCEL_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r\n')
for target in production preview; do
  curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
    "https://api.vercel.com/v10/projects/seorap/env" \
    -d "{\"key\":\"VITE_SEORAP_ENV\",\"value\":\"preview\",\"type\":\"plain\",\"target\":[\"$target\"]}" > /dev/null
done
```

- [ ] **Step 8: 배포와 확인**

```bash
git add web/vercel.json
git commit -m "chore(web): /api 넘김 경로를 api 함수로"
git push origin main
```
Vercel 배포가 끝나면(1~2분) 김건우가 Vercel에 로그인된 브라우저에서 `https://seorap-olive.vercel.app/seedS100000000000000000000000000` 접속 → [인증번호 받기] → 새 탭 `https://seorap-olive.vercel.app/dev/outbox`에서 번호 확인 → 입력 → 서랍. 휴대폰·카카오톡 인앱 확인은 Plan D에서 보호 우회 링크로 한다

---

### Task 20: M2 화면 확인 (김건우, 10-12)

- [ ] **Step 1:** 로컬 또는 미리보기에서 아래를 차례로 누른다

| 시나리오 | 확인할 것 |
|---|---|
| S1 | 3줄, "2매 중 1·2번째", 영유아 "실시함", 성인 2번째 "전달함 · 김영희 / → 김영희 · 010-2222-3333 / 받는 분이 열어 봄", S3 묶음 접힘 |
| S1 전달 | 이름·번호 입력 → 확인 화면 → 보내기 → 줄과 전달 이력 1줄 |
| S1 다른 분께 | 확인 문구 → 시트가 다시 열림 → 다른 번호로 전달 |
| S2 | "신청서 제출 후 열려요" (신청서 화면은 Plan B) |
| S4 | 진입 화면 이름 "성*향" |
| S5 | "취소됨", "취소 확인 중" |
| S7 | "준비 중" |
| S8 | 전달 이력 3줄 |
| 아무 줄 | 로그아웃 후 /box → "다시 인증해 주세요" |

- [ ] **Step 2:** 바꿀 점을 모아 Plan B 착수 전에 반영할지 정한다

---

## 명세와 달라진 점 (build-spec 갱신 대상)

| 항목 | build-spec | 이 계획 | 이유 |
|---|---|---|---|
| 공용 모듈 위치 | 루트 `shared/` | **`supabase/functions/_shared/core/`** | Edge Functions 번들러가 `supabase/` 밖 파일을 확실히 포함하는지 보장할 수 없다. 화면은 Vite 별칭 `@core`로 같은 파일을 쓴다 |
| 서버 함수 | 함수 34개 | **함수 1개(`api`) + 내부 라우터** | 설정·배포·차가운 시작을 한 곳으로. 경로는 명세의 이름 그대로 |
| DB 역할 | `seorap_app` 등 4종 | Plan A는 **service_role + RLS(anon·authenticated 차단) + 추가만 트리거** | 함수가 supabase-js로 접속하므로 별도 로그인 역할이 필요 없다. 워커의 직접 접속 역할은 Plan D |
| 암호문 칸 타입 | `bytea` | **`text`** (`v1.<iv>.<ct>`) | supabase-js·PostgREST로 bytea를 주고받는 변환을 없앤다 |
| `vouchers` 유일 제약 | `unique(order_item_id, unit_no)` | **`unique(order_item_id, test_item_id, unit_no)`** | 온가족 패키지는 한 상품주문에 영유아 1번째와 성인 1번째가 같이 있다 |
| `access_links` | `code_exposed_at` 없음 | **받는 분 코드 노출 시각 칸 추가** | "다른 분께"를 코드 노출 전까지만 허용(D-23) |
| 링크 닫힘 사유 | 7종 | **`resent` 추가** | 다시 보내기는 새 링크를 만들고 옛 링크를 닫는다(토큰 원문을 저장하지 않으므로 같은 링크를 다시 보낼 수 없다) |
| `order_items.handling` 값 | `kebal` | **`seorap`** | 서비스명 확정 |
| `delivery_mode` 값 | `kebal_message` | **`seorap_message`** | 같음 |
| 다시 보내기 한도 | 같은 번호 10분 간격 포함 | **다시 보내기는 같은 번호 간격 제외**(1매당 하루 3회·서랍당 하루 한도는 적용) | "못 받았어요"에 바로 응하기 위해 |
| 해시 접두사 | 없음 | `box:` · `forward:` · `sid:` · `otp:<id>:` · `phone:` · `code:` | 같은 값이 다른 용도의 해시와 겹치지 않게 |
| 테스트 | Vitest + Playwright | Plan A는 **Deno 단위·통합 + Vitest 컴포넌트**, Playwright는 Plan D | E2E는 화면이 다 나온 뒤 한 번에 |
| 개발 전용 테이블 | 없음 | **`dev_outbox`** | 가짜 문자·알림톡 확인용. 운영에서는 쓰지도 읽지도 않는다 |
