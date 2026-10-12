# 상담 예약·협력센터 관리 · 로컬 시안 (MVP-1)

> **실제 정보를 넣지 마세요.** 이 PC에서만 돌리는 시안이고, 데이터는 모두 가짜입니다. 화면과 시드는 로컬 주소가 아니면 시작하지 않습니다.

두레이로 하던 협력상담센터 예약 조율을 공용 원장으로 옮기기 위한 시안입니다.

- 인싸이트 직원 로그인 (공개 가입 없음, 계정은 시드가 만듦)
- 구매 건 목록(MVP-1): 구매자 · 구매 구분(검사 메인/상담 메인/협찬/공동구매) · 진행 검사 · 배정 센터 · 신청서 · 상담 현황. 상태별 건수 칩을 누르면 그 상태만 보인다
- 구매 건 직접 등록, 구글시트(폼 응답 CSV) 가져오기. 같은 줄을 다시 가져와도 한 건만 남는다
- 여러 건을 체크해 한 센터에 배정(운영 중인 센터만). 배정하면 "예약 요청"이 되고, 누가 언제 어디로 배정했는지 기록이 남는다
- 신청서 보기: 일반 칸, 민감정보(복용 약물·진단명, 결과지 링크), 마케팅(알게 된 경위)을 나눠 보관·표시
- 협력센터 목록: 기관명 · 지역(서울 강남) · 대상(영유아/아동·청소년/성인) · 전문 분야(발달·정서·청소년·학습·가족) · 상담 완료/배정 · 연락처. 기관명 검색, 지역·대상·상태 거르기
- 협력센터 상세, 등록, 수정
- 지도 보기(네이버 지도): 전국 화면은 시·도별 센터 수 동그라미, 확대하면 센터별 핀. 등록·수정 화면에서 지도를 눌러 위치를 찍는다
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

## 네이버 지도 키

지도는 네이버 클라우드 Maps(Web Dynamic Map)를 씁니다. `web/.env.local`에 Client ID 한 줄이 있어야 지도가 뜹니다(커밋하지 않는 파일, 시드를 다시 돌려도 지워지지 않음).

```
VITE_NAVER_MAPS_KEY_ID=<네이버 클라우드 Maps Application 의 Client ID>
```

- 네이버 클라우드 Application의 "Web 서비스 URL"에 `http://localhost`가 등록돼 있어야 합니다(포트 번호는 넣지 않음).
- 키가 없거나 인증에 실패하면 지도 자리에 안내가 뜨고, 목록 등 나머지는 그대로 동작합니다.
- 지금 키는 Mind-Connect 프로젝트의 것을 시안용으로 같이 씁니다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `deno task db:start` / `db:stop` | 로컬 Supabase 켜기·끄기 (데이터는 남음) |
| `deno task seed` | 가짜 계정 3개 + 협력센터 7곳 + 구매 건 15건. 센터·구매 건이 이미 있으면 그 부분은 건너뛴다 |
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
  core/            순수 규칙(권역·센터·구매 건 코드, 시트 열 맞춤, 문구·오류 코드·입력 검사). 화면과 시험이 같이 쓴다
  supabase/        로컬 DB 설정과 마이그레이션
  scripts/         시드(seed.ts), 로컬 접속값 읽기(local.ts)
    samples/       구글시트 가져오기 연습용 가짜 CSV
  tests/           DB 권한 시험
  web/             화면 (Vite + React + MUI)
    src/pages/admin/counsel/   인싸이트 화면. 나중에 서랍 어드민으로 옮길 폴더
```

서랍 원본에서 그대로 가져다 쓰는 파일이 있습니다(복사본 없음). 서랍 쪽이 바뀌면 이 화면도 같이 바뀝니다.

- `web/src/theme/seorap.ts` (테마)
- `web/src/components/Toast.tsx`
- `supabase/functions/_shared/core/time.ts` (날짜 표시)

## 권한

- 화면은 표를 **읽기만** 합니다. 쓰기는 DB 함수(`rpc_create_center`, `rpc_update_center`, `rpc_create_purchase`, `rpc_import_applications`, `rpc_assign_sessions`)로만 되고, 표에 직접 쓰는 권한은 아무에게도 없습니다.
- 누가 무엇을 할 수 있는지는 DB 표 `counsel.role_caps` 하나가 정합니다.

  | 능력 | 관리자(`hq_admin`) | 담당자(`hq_manager`) |
  |---|---|---|
  | `center.manage` 센터 등록·수정 | O | |
  | `purchase.manage` 구매 건 등록·시트 가져오기 | O | O |
  | `session.assign` 센터 배정 | O | O |

- 상담 기록(`session_events`)은 덧붙이기만 됩니다. 고치거나 지우는 것은 DB가 막습니다.
- 읽기 권한은 DB 행 단위 권한(RLS)이 정합니다. 본사 소속이면 전체 센터, 센터 소속이면 자기 센터만 봅니다(센터 계정은 MVP-2부터).
- 소속을 끝내면(`left_at`) 다음 요청부터 바로 막힙니다.

## 구글시트 가져오기 연습

`scripts/samples/`의 가짜 CSV로 연습합니다. 실제 신청자 응답 파일은 올리지 않습니다. 파일별 내용은 `scripts/samples/README.md`에 있습니다.

## 다음 단계

MVP-2: 구매자 상세(신청서·상담 기록), 센터 상세의 배정 건 누적, 예약 확정·상담 완료 같은 상태 바꾸기. 지금까지의 가정은 `docs/assumptions.md`에 있습니다.
