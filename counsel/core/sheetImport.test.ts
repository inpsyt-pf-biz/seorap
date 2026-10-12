import { assert, assertEquals } from '@std/assert'
import { parseCsv } from './csv.ts'
import { mapHeaders, parseSheetTimestamp, previewImport, importPayload } from './sheetImport.ts'

// 현행 구글폼 신청서 4종의 열 이름(질문 문장). 응답 내용은 넣지 않는다.
const HEADERS = {
  test_main: ['타임스탬프', '예약전화 완료시 체크', '상담 종료', '개인정보 제3자 제공 동의', "상담 이용을 원하실 경우 '확인하고 동의'를 선택해 주세요.", '상담 예약 일정', '상담을 진행할 분의 성함을 작성해 주세요.', '연락처를 작성해 주세요.', '생년월일을 입력해 주세요.', '거주 지역을 작성해 주세요.', '현재 재학 중일 경우 학교명을 알려주세요.', '보호자 성함을 작성해 주세요.', '보호자 연락처를 알려주세요.', '상담 진행할 심리검사를 선택해 주세요.', '상담을 신청하신 이유를 작성해 주세요.', '상담 희망 예약일을 작성해 주세요.', '복용하고 있는 약물의 이름이나 진단받은 질환명을 알려주세요.', '심리 상담 경험을 알려주세요.', '인싸이트 스마트스토어를 알게 된 경위를 알려주세요.', '취소 및 환불 규정 확인', '상담에서 기대하는 부분을 작성해 주세요.', '희망하는 상담 방식을 선택해 주세요.', '검사옵션', '상담 옵션', '구매 시 메모', '관리자 메모'],
  counsel_main: ['타임스탬프', '개인정보 제3자 제공 동의', "상담 이용을 원하실 경우 '확인하고 동의'를 선택해 주세요.", '(필수) 성함을 알려주세요.', '(필수) 연락처를 알려주세요.', '(필수) 생년월일을 알려주세요.', '거주 지역을 알려주세요.', '현재 재학 중일 경우 학교명을 알려주세요.', '보호자 성함을 알려주세요.', '보호자 연락처를 알려주세요.', '상담하고 싶은 분야를 알려주세요.', '상담 받고 싶은 이유를 알려주세요.', '상담 예약하고 싶은 요일과 시간대를 알려주세요.', '복용하고 있는 약물의 이름이나 진단받은 질환명을 알려주세요.', '심리 상담 경험을 알려주세요.', '인싸이트 스마트스토어를 알게 된 경위를 알려주세요.', '취소 및 환불 규정 확인', '요청사항 또는 하고 싶은 말을 작성해 주세요.'],
  sponsored: ['타임스탬프', '예약전화 완료시 체크', '상담 종료', '개인정보 제3자 제공 동의', "상담 이용을 원하실 경우 '확인하고 동의'를 선택해 주세요.", '아이의 이름을 작성해 주세요.', '연락처를 작성해 주세요.', '생년월일을 작성해 주세요.', '심리 검사 결과지를 첨부해 주세요.', '현재 거주지를 작성해 주세요.', '상담을 진행할 심리검사를 선택해 주세요.', '보호자 성함을 작성해 주세요.', '보호자 연락처를 작성해 주세요.', '희망하는 상담 분야를 체크해 주세요.', '상담을 신청하신 이유를 작성해 주세요.', '상담 희망 예약일을 작성해 주세요.', '현재 복용하고 있는 약물 또는 진단 받은 질환명을 작성해 주세요.', '심리상담 경험 여부를 체크해 주세요.', '인싸이트 공식스토어를 알게 된 경위를 체크해 주세요.', '현재 재학 중인 경우 학교명을 작성해 주세요.', '상담에서 기대하는 부분을 작성해 주세요.', '희망하는 상담 방식을 선택해 주세요.', '현재 거주지를 작성해 주세요.'],
  group_buy: ['타임스탬프', '예약 완료', '상담 종료', '개인정보 제3자 제공 동의', '취소 및 환불 규정 확인', '아이의 이름을 작성해 주세요.', '보호자의 성함을 작성해 주세요.', '연락처를 작성해 주세요.', '자녀의 생년월일을 작성해 주세요.', '상담을 진행할 심리검사를 선택해 주세요.', '현재 거주지를 작성해 주세요.', '희망하는 상담 방식을 선택해 주세요.', '상담 방식을 선택해 주세요.', '상담을 신청하신 이유를 작성해 주세요.', '상담 희망 예약일을 작성해 주세요.', '복용하고 있는 약물의 이름이나 진단받은 질환명을 알려주세요.', '심리상담 경험 여부를 체크해 주세요.', '인싸이트 스마트스토어를 알게 된 경위를 알려주세요.', '상담에서 기대하는 부분을 작성해 주세요.', '19열', '19열', '관리자 메모'],
}

Deno.test('CSV: 따옴표 안의 쉼표·줄바꿈·따옴표, BOM, CRLF', () => {
  const csv = '﻿이름,메모\r\n"김예시","첫 줄, 둘째\n줄 ""인용"""\r\n이샘플,\r\n\r\n'
  assertEquals(parseCsv(csv), [['이름', '메모'], ['김예시', '첫 줄, 둘째\n줄 "인용"'], ['이샘플', '']])
})

Deno.test('신청서 4종의 열이 필요한 칸에 모두 맞춰진다', () => {
  const need = ['submitted_at', 'consent', 'client_name', 'client_phone', 'client_birth', 'residence', 'test_name', 'reason', 'preferred_schedule', 'medication_diagnosis', 'counseling_experience', 'referral_source']
  for (const [type, headers] of Object.entries(HEADERS)) {
    const { columns } = mapHeaders(headers)
    for (const f of need) {
      if (type === 'counsel_main' && f === 'test_name') continue // 상담 메인에는 검사가 없다
      assert(columns[f as keyof typeof columns] !== undefined, `${type}: ${f} 열을 못 찾음`)
    }
  }
})

Deno.test('열 맞춤: 보호자와 내담자, 상담 방식이 두 개인 경우, 의미 없는 열', () => {
  const g = mapHeaders(HEADERS.group_buy)
  assertEquals(HEADERS.group_buy[g.columns.client_name!], '아이의 이름을 작성해 주세요.')
  assertEquals(HEADERS.group_buy[g.columns.guardian_name!], '보호자의 성함을 작성해 주세요.')
  assertEquals(HEADERS.group_buy[g.columns.preferred_method!], '희망하는 상담 방식을 선택해 주세요.')
  assertEquals(HEADERS.group_buy[g.columns.reserved!], '예약 완료')
  assert(g.ignored.includes('19열'))
  assert(g.ignored.includes('상담 방식을 선택해 주세요.'))
  const t = mapHeaders(HEADERS.test_main)
  assertEquals(HEADERS.test_main[t.columns.guardian_phone!], '보호자 연락처를 알려주세요.')
  assertEquals(HEADERS.test_main[t.columns.client_phone!], '연락처를 작성해 주세요.')
  assertEquals(HEADERS.test_main[t.columns.counsel_option!], '상담 옵션')
  const s = mapHeaders(HEADERS.sponsored)
  assertEquals(HEADERS.sponsored[s.columns.result_file_url!], '심리 검사 결과지를 첨부해 주세요.')
  assertEquals(HEADERS.sponsored[s.columns.counsel_field!], '희망하는 상담 분야를 체크해 주세요.')
})

Deno.test('타임스탬프: 한국어·숫자 형식을 서울 시각으로', () => {
  assertEquals(parseSheetTimestamp('2026. 9. 3 오후 2:15:30'), '2026-09-03T14:15:30+09:00')
  assertEquals(parseSheetTimestamp('2026. 9. 3 오전 12:05:00'), '2026-09-03T00:05:00+09:00')
  assertEquals(parseSheetTimestamp('2026/09/03 09:07:01'), '2026-09-03T09:07:01+09:00')
  assertEquals(parseSheetTimestamp('엉뚱한 값'), null)
})

Deno.test('미리보기: 동의 판정, 종료 건 건너뛰기, 빈 줄, 담당자 칸은 관리자 메모로', () => {
  const h = HEADERS.group_buy
  const row = (over: Record<string, string>) => h.map((col) => over[col] ?? '')
  const csv = [h, row({
    '타임스탬프': '2026. 9. 3 오후 2:15:30', '예약 완료': 'TRUE', '개인정보 제3자 제공 동의': '동의합니다', '취소 및 환불 규정 확인': '확인했습니다',
    '아이의 이름을 작성해 주세요.': '김예시', '보호자의 성함을 작성해 주세요.': '김보호', '연락처를 작성해 주세요.': '010-0000-1111',
    '상담을 진행할 심리검사를 선택해 주세요.': '아동 기질검사', '관리자 메모': '토요일 선호',
  }), row({ '타임스탬프': '2026. 9. 4 오전 10:00:00', '상담 종료': 'TRUE', '아이의 이름을 작성해 주세요.': '이예시' }),
  row({ '타임스탬프': '2026. 9. 5 오전 10:00:00', '개인정보 제3자 제공 동의': '동의하지 않음', '아이의 이름을 작성해 주세요.': '박예시' }),
  // 응답 시각만 있고 이름·연락처가 없는 줄은 "빈 줄"로 뺀다(칸이 모두 빈 줄은 CSV 를 읽을 때 이미 버려진다)
  row({ '타임스탬프': '2026. 9. 6 오전 10:00:00' }), row({})].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
  const p = previewImport(csv)
  assertEquals(p.counts, { ok: 2, ended: 1, tooLong: 0, empty: 1 })
  const first = p.rows[0].row
  assertEquals(first.application.client_name, '김예시')
  assertEquals(first.application.guardian_name, '김보호')
  assertEquals(first.application.consent_third_party, true)
  assertEquals(first.application.refund_policy_checked, true)
  assertEquals(first.application.submitted_at, '2026-09-03T14:15:30+09:00')
  assertEquals(first.admin_memo, '토요일 선호\n[시트] 예약 완료 체크됨')
  assertEquals(p.rows[2].row.application.consent_third_party, false)
  assertEquals(importPayload(p).length, 2)
  // 종료 건도 가져오려면 옵션을 끈다
  assertEquals(previewImport(csv, { skipEnded: false }).counts.ok, 3)
})

Deno.test('미리보기: 칸 길이를 넘는 줄은 빼고 알린다', () => {
  const h = ['타임스탬프', '아이의 이름을 작성해 주세요.', '상담을 신청하신 이유를 작성해 주세요.']
  const csv = `${h.join(',')}\n2026/09/03 09:00:00,김예시,${'가'.repeat(2001)}`
  const p = previewImport(csv)
  assertEquals(p.counts.tooLong, 1)
  assertEquals(p.rows[0].fields, ['reason'])
  assertEquals(importPayload(p).length, 0)
})

Deno.test('상품주문번호 열이 있으면 번호를 꺼내고(공백·하이픈 빼고), 가져오기 줄에 담는다', () => {
  const h = ['타임스탬프', '네이버 상품주문번호를 적어 주세요.', '아이의 이름을 작성해 주세요.', '연락처를 작성해 주세요.']
  const csv = [h, ['2026. 10. 9 오전 9:00:00', '2026-1001-0000-0006', '거너더', '010-0000-2116']].map((r) => r.join(',')).join(String.fromCharCode(10))
  const p = previewImport(csv)
  assertEquals(p.mapping.columns.naver_product_order_id, 1)
  assertEquals(p.rows[0].row.naver_product_order_id, '2026100100000006')
  assertEquals(importPayload(p)[0].naver_product_order_id, '2026100100000006')
})
