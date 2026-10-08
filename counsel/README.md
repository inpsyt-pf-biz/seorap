# 협력상담센터 관리 · 로컬 시안 (MVP-0)

> **실제 정보를 넣지 마세요.** 이 PC에서만 돌리는 시안이고, 데이터는 모두 가짜입니다. 화면과 시드는 로컬 주소가 아니면 시작하지 않습니다.

두레이로 하던 협력상담센터 예약 조율을 공용 원장으로 옮기기 위한 시안입니다. MVP-0에는 그 바탕만 있습니다.

- 인싸이트 직원 로그인 (공개 가입 없음, 계정은 시드가 만듦)
- 협력센터 목록(검색·권역·상태 거르기), 상세, 등록, 수정
- 동시에 고치면 나중 저장을 거부하고 최신 내용을 다시 불러오게 함

설계 전체는 `04_project/설계안-협력상담센터관리툴-로컬시안.md`에 있습니다.

## 처음 실행 (PowerShell)

1. Docker Desktop을 켜고 "Engine running"을 확인합니다.
2. 이 폴더에서 차례로 실행합니다.

```powershell
cd C:\Users\user\Desktop\04_project\seorap\counsel
deno task db:start
deno task seed
deno task web
```

3. 브라우저에서 http://localhost:5180 을 엽니다. 로그인 화면 아래의 개발용 계정 버튼으로 바로 들어갈 수 있습니다.

| 계정 | 역할 | 할 수 있는 것 |
|---|---|---|
| 관리자 · 김관리 (`hq.admin@counsel.test`) | 인싸이트 관리자 | 센터 보기·등록·수정 |
| 담당자 · 이담당 (`hq.manager@counsel.test`) | 인싸이트 담당자 | 센터 보기 |
| 소속 없음 · 최소속 (`nobody@counsel.test`) | 없음 | "소속 없음" 화면만 |

비밀번호는 첫 시드 때 만들어져 `counsel/.env.local`의 `COUNSEL_SEED_PASSWORD`에 들어갑니다(커밋하지 않는 파일). 개발 모드에서는 탭마다 로그인이 따로라서, 탭별로 다른 계정을 띄워 볼 수 있습니다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `deno task db:start` / `db:stop` | 로컬 Supabase 켜기·끄기 (데이터는 남음) |
| `deno task seed` | 가짜 계정 3개 + 협력센터 7곳. 센터가 이미 있으면 계정만 맞춘다 |
| `deno task db:reset` | DB를 비우고 마이그레이션 + 시드를 다시 넣는다 |
| `deno task web` | 화면(5180) |
| `deno task check` | 규칙 시험, DB 권한 시험, 화면 타입 검사·린트·시험을 모두 돌린다. DB가 켜져 있어야 한다 |

## 포트

| 용도 | 포트 |
|---|---|
| Supabase API | 56321 |
| DB | 56322 |
| Studio (DB 관리 화면) | 56323 |
| 화면 | 5180 |

서랍 로컬(55321~, 화면 5173)과 동시에 띄울 수 있습니다. 쓰지 않는 기능(파일 저장, 실시간, 메일, 서버 함수, 분석)은 꺼 두었습니다.

## 구조

```
counsel/
  core/            순수 규칙(권역·센터 코드·문구·오류 코드·입력 검사). 화면과 시험이 같이 쓴다
  supabase/        로컬 DB 설정과 마이그레이션
  scripts/         시드(seed.ts), 로컬 접속값 읽기(local.ts)
  tests/           DB 권한 시험
  web/             화면 (Vite + React + MUI)
    src/pages/admin/counsel/   인싸이트 화면. 나중에 서랍 어드민으로 옮길 폴더
```

서랍 원본에서 그대로 가져다 쓰는 파일이 있습니다(복사본 없음). 서랍 쪽이 바뀌면 이 화면도 같이 바뀝니다.

- `web/src/theme/seorap.ts` (테마)
- `web/src/components/Toast.tsx`
- `supabase/functions/_shared/core/time.ts` (날짜 표시)

## 권한

- 화면은 표를 **읽기만** 합니다. 등록·수정은 DB 함수(`counsel.rpc_create_center`, `rpc_update_center`)로만 되고, 표에 직접 쓰는 권한은 아무에게도 없습니다.
- 누가 무엇을 할 수 있는지는 DB 표 `counsel.role_caps` 하나가 정합니다. 지금은 `hq_admin`의 `center.manage` 한 줄입니다.
- 읽기 권한은 DB 행 단위 권한(RLS)이 정합니다. 본사 소속이면 전체 센터, 센터 소속이면 자기 센터만 봅니다(센터 계정은 MVP-2부터).
- 소속을 끝내면(`left_at`) 다음 요청부터 바로 막힙니다.

## 다음 단계

MVP-1: 예약 등록, 센터 지정, 예약 목록·상세(인싸이트 내부 전용). MVP-0 가정은 `docs/assumptions.md`에 있습니다.
