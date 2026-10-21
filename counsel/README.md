# 상담 예약·협력센터 관리 · 로컬 시안 (MVP-2)

> **실제 정보를 넣지 마세요.** 이 PC에서만 돌리는 시안이고, 데이터는 모두 가짜입니다. 화면과 시드는 로컬 주소가 아니면 시작하지 않습니다.

두레이로 하던 협력상담센터 예약 조율을 공용 원장으로 옮기기 위한 시안입니다.

- 인싸이트 직원 로그인 (공개 가입 없음, 계정은 시드가 만듦)
- 구매 건 목록(MVP-1): 구매자 · 구매 구분(검사 메인/상담 메인/협찬/공동구매/미분류) · 진행 검사 · 배정 센터 · 결제일 · 네이버 주문 상태 · 신청서 · 상담 현황. 상태별 건수 칩을 누르면 그 상태만 보인다
- 구매 건 직접 등록(네이버 상품주문번호를 적어 둘 수 있다)
- 구글시트(폼 응답 CSV) 가져오기: 상품주문번호가 적힌 줄은 그 네이버 주문에 바로 붙고, 나머지는 신청서 대기함으로 간다. 같은 줄을 다시 가져와도 한 번만 들어간다
- 신청서 대기함(MVP-2): 연락처 끝 4자리·이름·구분·날짜로 후보 구매 건을 보여 주고, 붙이기 / 새 구매 건으로 등록(네이버 밖에서 판 건) / 버리기
- 여러 건을 체크해 한 센터에 배정(운영 중인 센터만). 배정하면 "예약 요청"이 되고, 누가 언제 어디로 배정했는지 기록이 남는다
- 구매 건 상세 페이지(MVP-2)
  - 맨 위 진행 단계: 구매 → 신청서 작성 → 센터 배정 → 상담 예약 → 검사 실시 → 상담 완료 → 보고서 제출. 회차마다 보이고, 뒤 단계가 끝났는데 앞 단계가 비면 '누락'으로 표시, 아래에 '지금 할 일' 한 줄
  - 상담 탭: 회차마다 배정·다시 배정, 예약 확정(일시·방식), 예약 변경(사유), 상담 완료, 상담 불가(사유, 다른 센터로 다시 배정 가능), 취소(사유). 건 메모(누가 언제, 고치거나 지울 수 없음)
  - 신청서 탭(일반 칸, 민감정보, 마케팅을 나눠 보관·표시)
  - 검사 탭: 구매자 아래에 함께 산 검사를 한 줄씩(응시자·검사명·실시 상태·결과 보기). 실시 상태는 서랍, 응시자 이름·결과지는 인싸이트 검사결과 API에서 채울 자리(지금은 가짜 값)
  - 주문 정보 탭(구매 정보 + 네이버 주문·상품·금액·상태·취소·주문자·정산), 이력 탭(배정·상태·예약 변경과 사유)
- 네이버 주문 입구: 커머스API 상품주문 응답을 받는 함수. 연동 프로그램만 부르고, 취소·반품을 상담 줄에 반영한다. 칸 목록은 `docs/naver-order-fields.md`
- 협력센터 목록: 기관명 · 지역(서울 강남) · 대상(영유아/아동·청소년/성인) · 전문 분야(발달·정서·청소년·학습·가족) · 상담 완료/배정 · 연락처. 기관명 검색, 지역·대상·상태 거르기
- 협력센터 상세(배정·상담 현황, 상담사 목록), 등록, 수정
- 지도 보기(네이버 지도): 전국 화면은 시·도별 센터 수 동그라미, 확대하면 센터별 핀. 등록·수정 화면에서 지도를 눌러 위치를 찍는다
- 동시에 고치면 나중 저장을 거부하고 최신 내용을 다시 불러오게 함

설계 전체는 `04_project/00_문서/기획_상담예약/설계안-협력상담센터관리툴-로컬시안.md`(저장소 밖, 작성자 PC)에 있습니다.

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
| `deno task demo [결과 파일 경로]` | 체험판(가짜 데이터를 넣어 HTML 한 파일로 도는 어드민)을 만든다. 기본 위치는 `web/.demo/상담예약관리-체험판.html`. 아래 '체험판' 참고 |

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
  core/            순수 규칙(권역·센터·구매 건 코드, 시트 열 맞춤, 네이버 주문 칸 변환·이름표, 문구·오류 코드·입력 검사). 화면과 시험이 같이 쓴다
  supabase/        로컬 DB 설정과 마이그레이션
  scripts/         시드(seed.ts), 로컬 접속값 읽기(local.ts), 주문자 정보 암호화(pii.ts), 체험판 만들기(demo-*.ts)
    samples/       구글시트 가져오기 연습용 가짜 CSV
  tests/           DB 권한·네이버 입구 시험
  docs/            가정 목록, 네이버 상품주문 칸 목록
  web/             화면 (Vite + React + MUI)
    src/pages/admin/counsel/   인싸이트 화면. 나중에 서랍 어드민으로 옮길 폴더
    src/demo/      체험판 전용(가짜 DB·안내 띠·검수 의견). 평소 화면은 쓰지 않는다
```

서랍 원본에서 그대로 가져다 쓰는 파일이 있습니다(복사본 없음). 서랍 쪽이 바뀌면 이 화면도 같이 바뀝니다.

- `web/src/theme/seorap.ts` (테마)
- `web/src/components/Toast.tsx`
- `supabase/functions/_shared/core/time.ts` (날짜 표시)
- `supabase/functions/_shared/core/phone.ts` (주문자 이름·연락처 가리기)

## 권한

- 화면은 표를 **읽기만** 합니다. 쓰기는 DB 함수(`rpc_create_center`, `rpc_update_center`, `rpc_create_purchase`, `rpc_import_applications`, `rpc_assign_sessions`, `rpc_set_purchase_type`, `rpc_resolve_naver_review`, `rpc_update_session`, `rpc_add_purchase_note`, `rpc_attach_inbox`, `rpc_create_from_inbox`, `rpc_dismiss_inbox`, `rpc_save_counselor`)로만 되고, 표에 직접 쓰는 권한은 아무에게도 없습니다.
- 네이버 주문 입구(`rpc_intake_naver_product_orders`), 검사 실시 현황 입구(`rpc_sync_purchase_tests`), 주문자 정보 지우기(`rpc_purge_naver_orderers`)는 연동 프로그램(`service_role`)만 부릅니다. 로그인한 직원은 관리자라도 못 부릅니다.
- 누가 무엇을 할 수 있는지는 DB 표 `counsel.role_caps` 하나가 정합니다.

  | 능력 | 관리자(`hq_admin`) | 담당자(`hq_manager`) |
  |---|---|---|
  | `center.manage` 센터 등록·수정 | O | |
  | `purchase.manage` 구매 건 등록·시트 가져오기 | O | O |
  | `session.assign` 센터 배정 | O | O |
  | `session.manage` 예약 확정·변경·완료·불가·취소 | O | O |
  | `note.write` 건 메모 | O | O |
  | `settlement.view` 정산 예정 금액·수수료 보기 | O | |

- 상담 기록(`session_events`)과 건 메모(`purchase_notes`)는 덧붙이기만 됩니다. 고치거나 지우는 것은 DB가 막습니다.
- 읽기 권한은 DB 행 단위 권한(RLS)이 정합니다. 본사 소속이면 전체 센터, 센터 소속이면 자기 센터만 봅니다(센터 계정은 MVP-3부터).
- 소속을 끝내면(`left_at`) 다음 요청부터 바로 막힙니다.

## 주문자 정보

- 네이버 주문자 이름·연락처는 연동 쪽에서 암호화(AES-GCM)해 넘기고, 화면에는 가린 값(김\*시, 010-\*\*\*\*-1234)만 열어 줍니다. 암호문과 짝 맞춤 값(HMAC)은 화면 계정이 읽을 수 없습니다.
- 거래가 끝나고 61일이 지나면 `rpc_purge_naver_orderers`로 지웁니다(네이버가 같은 시점부터 가립니다). 운영에서는 매일 한 번 돌립니다.
- 로컬 시안의 암호화 키는 `counsel/.env.local`의 가짜 키(`COUNSEL_PII_ENC_KEY`, `COUNSEL_PII_HMAC_KEY`)입니다. 화면(`web/.env.local`)에는 넣지 않습니다.

## 구글시트 가져오기 연습

`scripts/samples/`의 가짜 CSV로 연습합니다. 실제 신청자 응답 파일은 올리지 않습니다. 파일별 내용은 `scripts/samples/README.md`에 있습니다.

## 체험판

서버 없이 HTML 파일 하나를 더블클릭해 실제 화면을 눌러 볼 수 있게 만든 검수용 판입니다. 메신저·메일로 보내면 됩니다.

- 화면 코드는 그대로 쓰고, DB 연결(`shell/supabaseClient`)과 맨 위 안내 띠(`components/DemoBanner`)만 `web/src/demo/`의 것으로 바꿔 끼워 따로 빌드합니다(`web/vite.demo.config.ts`). 평소 화면(`deno task web`)에는 영향이 없습니다.
- 데이터는 로컬 DB를 관리자 계정으로 읽어 넣습니다(`scripts/demo-snapshot.ts`). 시드가 만든 가짜 데이터만 담기 위해, 빈 DB에 시드를 넣은 시각(`web/.demo/seeded-at.json`) 뒤에 생기거나 바뀐 줄이 있으면 멈춥니다. 전화번호 칸이 시드 번호(가운데 0000)가 아니어도 멈춥니다. 그러니 만들기 전에 `deno task db:reset`을 하고, 화면에서 아무것도 바꾸지 않은 채 `deno task demo`를 돌립니다.
- 배정·예약 확정·상담 완료·메모·신청서 대기함 처리 같은 쓰기는 DB 함수를 흉내 낸 `web/src/demo/rpc.ts`가 맡습니다. 규칙의 정본은 SQL이므로 DB 함수를 바꾸면 여기도 같이 고칩니다(`web/src/demo/demo.test.ts`가 실제 `lib/api.ts`를 붙여 확인).
- 바꾼 내용은 받는 사람 브라우저에만 남고, 맨 위 [처음 상태로]로 되돌립니다. 오른쪽 아래 [검수 의견]에서 확인할 점에 답하고 의견을 복사해 보냅니다.
- 지도 키·접속값은 넣지 않습니다(`.env.local`을 읽지 않음). 만든 뒤 `.env.local`의 값이 파일 안에 없는지 검사하고, 있으면 파일을 만들지 않습니다.
- `web/.demo/`(데이터·빌드 결과)는 저장소에 올리지 않습니다.

## 다음 단계

MVP-3: 센터 공용 계정 로그인(자기 센터 건만 보고 예약일 입력·변경, 상담 완료, 보고서 올리기). 네이버 응답 원본 보관은 연동 쪽 설계에서 따로 정합니다. 지금까지의 가정은 `docs/assumptions.md`에 있습니다.
