# 예약 확정 뒤 검사 열림 · 상담메인 신청서 · 제공받는 업체 정보 (11-04)

> 근거: Works-archive `projects/2026-10-01-naver-voucher-box/scenario-sts-couple.md` §2·§5-1·E4, 11-04 건우님 승인("이대로 구현").
> 브랜치 `feat/counsel-confirm` (plan-a `23473fb` 에서), 작업 폴더 `VS/seorap-confirm`.

## 1. 검사는 예약이 확정된 뒤에 연다

- **상담 DB** `rpc_seorap_counsel_status(p_purchase_ids uuid[])` (서버 키 전용): 구매 건의 회차 줄(purchase_id, seq, status, scheduled_at, center_name)을 돌려준다
- **서랍 DB** 마이그레이션
  - `counsel_submissions.unlocked_at` 추가. 이미 낸 건은 옛 규칙으로 열렸으므로 `submitted_at` 으로 채운다(E4: 열린 검사는 다시 닫지 않는다)
  - `counsel_record_submission` 은 제출 기록만 남기고 잠금을 풀지 않는다
  - `counsel_unlock(order_id)`: `unlocked_at` 이 비었을 때만 기록하고 `counsel_pending` 을 푼다. 서버 키 전용
- **공용 규칙** `core/counselBooking.ts`: 회차 줄 → 예약 상태(waiting / confirmed / completed), 일시, 센터, 완료 권장일(D-3)
- **서랍 서버** `box`: 제출한 상담 건의 상태를 상담 DB 에 묻는다. 확정·완료면 `counsel_unlock` 뒤에 줄 상태를 만든다. 상담 DB 에 닿지 못하면 잠금을 유지하고, 오류를 기록한다
- **문구** 잠긴 줄 "예약이 확정되면 열려요", 카드 3단계(제출 전 / 연락 대기 / 예약 확정 · 일시 · 센터 · 완료 권장일), 제출 완료 화면에서 "이제 검사를 시작할 수 있어요" 를 뺀다
- 범위 밖: 확정 알림톡(T3). 서랍은 고객이 서랍을 열 때만 확정을 알기 때문이다

## 2. 검수 주문을 상담메인 신청서로

- 시드(S2, T1~T5)의 관리코드를 `STS-CPL-R` 로 바꾼다. 시험용 가짜 상담(mock)도 `STS-CPL-R` 을 받는다
- 미리보기 상담 DB 에는 로컬 "[상담메인] STS 커플상담 신청서" 3판에 3번을 반영한 판을 올리고 `STS-CPL-R` 에 연결한다(건우님 SQL 실행)

## 3. 제공받는 업체 정보

- 신청서 블록 종류 `providers` 추가. 답을 받지 않는 안내 블록이다
- `rpc_seorap_form_for` 가 협력센터 중 운영 중(active)이고 본사가 아닌 곳의 업체명·대표 전화·주소를 `providers` 로 함께 준다. 담당자 이름·연락처는 내보내지 않는다
- 서랍 신청서: "제공받는 업체 정보 (N곳)" 을 눌러 펼친다. 상담 어드민 편집기 미리보기는 센터 목록에서 같은 규칙으로 만든다
- 제출할 때 서버가 그 순간의 업체 이름 목록을 제3자 제공 동의 기록(`consents[].providers`)에 함께 넘긴다. 연 뒤 제출 전 사이에 센터가 바뀔 수 있으나, 분 단위 간격이라 받아들인다

## 시험

- 상담 DB: 상태 함수(서버 키만, 줄 내용), form_for 의 providers(본사·운영 중 아님 제외, 담당자 칸 없음)
- 서랍 core: 예약 상태 판정, D-3 날짜, providers 블록이 답을 받지 않음
- 서랍 API(mock): 제출해도 잠김 · 카드 waiting → 확정 건이면 열림 · 카드 confirmed → 다시 열어도 열림
- 화면: 신청서 업체 목록 펼치기, 카드 3단계 문구
- 로컬 전체: 제출 → 잠김 → 상담 어드민에서 예약 확정 → 서랍 다시 열면 열림
