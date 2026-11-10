// 시드 신청서 템플릿: 현재 쓰는 Google 설문지 "[협찬] STS 커플상담 신청서"(Works-archive counsel-form-google-2026-10-28.md)를
// 서랍 템플릿으로 옮긴 것. 바꾼 점: 연락처 문항은 뺀다(서랍이 이미 안다), 희망 예약일은 "가능 시간대" 문항으로,
// 복용 약물은 민감정보로 표시하고 민감정보 선택 동의를 더한다(01-plan §0 10-07·10-29).
import { DEFAULT_AVAILABILITY, type FormDefinition } from '../../supabase/functions/_shared/core/counselForm.ts'

// 서랍 시드 S2(검사 + 상담 주문)의 관리코드와 같게 맞춘다
export const SEED_FORM_MANAGE_CODE = 'STS-CPL-S'

// 개인정보 제3자 제공 동의 본문 (11-04). 특정 센터 이름을 적지 않고 '제공받는 업체 정보' 블록(운영 중인 협력센터 목록)을 가리킨다
export const THIRD_PARTY_HELP =
  "인싸이트 심리검사연구소는 개인정보보호법에 따라 본인(신청자)의 동의를 얻어, 상담 서비스 제공을 위해 아래와 같이 개인정보를 제3자에게 제공합니다.\n본 약관에 동의하지 않을 수 있으나 이 경우 서비스 제공이 불가능합니다.\n\n1. 제공받는 자: 인싸이트 협력 상담센터 (아래 '제공받는 업체 정보' 참고)\n2. 이용 목적: 상담 서비스 예약 및 제공\n3. 제공 항목: (공통) 이름, 생년월일, 연락처, 심리검사결과 / (미성년자) 주소, 보호자 성함, 보호자 연락처\n4. 보유·이용 기간: 상담 서비스 제공 종료 후 2주"

export const SEED_FORM: { name: string; definition: FormDefinition } = {
  name: '[협찬] STS 커플상담 신청서',
  definition: {
    intro: '안녕하세요, 인싸이트 심리검사연구소입니다.\n원활한 상담 진행을 위해 아래 문답에 성실히 답변해 주시기 바랍니다.',
    fields: [
      {
        id: 'consent_third_party', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party',
        help: THIRD_PARTY_HELP,
      },
      {
        id: 'consent_sensitive', type: 'consent', label: '민감정보 수집·이용 동의(선택)', consentKind: 'sensitive',
        help: '복용 중인 약물·진단받은 질환은 건강에 관한 민감정보입니다. 동의하시면 아래 해당 문항에 적을 수 있고, 동의하지 않아도 상담을 신청할 수 있습니다.\n보유·이용 기간: 상담 서비스 제공 종료 후 2주',
      },
      {
        // 11-04: 업체를 글로 적지 않고 상담 어드민의 운영 중인 협력센터 목록을 붙인다 (센터가 늘면 저절로 늘어난다)
        id: 'center_info', type: 'providers', label: '제공받는 업체 정보',
      },
      {
        id: 'guide', type: 'section', label: '상담 신청서 작성 안내',
        help: '상담에 참여하실 분의 정보를 작성해 주세요.\n상담센터에서 영업일 기준 7일 이내에 연락드립니다.\n※ 모든 상담은 비밀보장을 원칙으로 하며, 신청자의 동의 없이 외부로 유출되지 않습니다. 다만 생명이나 안전에 심각한 위험이 있는 경우(예: 자살 위험 등)에는 예외가 적용될 수 있습니다.',
      },
      { id: 'nickname', type: 'short', label: '닉네임', required: true, help: '인스타그램 계정, 브랜드커넥트 닉네임 등 (해당되지 않으면 X)' },
      { id: 'name', type: 'short', label: '성함', required: true, help: '커플 중 대표자 1인', mapsTo: 'client_name' },
      { id: 'birth', type: 'date', label: '생년월일', required: true, help: '커플 중 대표자 1인', mapsTo: 'client_birth' },
      { id: 'residence', type: 'short', label: '현재 거주지', mapsTo: 'residence' },
      { id: 'dating', type: 'short', label: '연애 기간', required: true, help: '예: 1년' },
      { id: 'wedding', type: 'single', label: '현재 결혼 예정이신가요?', required: true, options: ['결혼 예정입니다.', '아닙니다.'] },
      { id: 'reason', type: 'short', label: '상담을 신청하신 이유', mapsTo: 'reason' },
      { id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true, mapsTo: 'preferred_schedule', availability: DEFAULT_AVAILABILITY },
      { id: 'drug', type: 'long', label: '현재 복용하고 있는 약물 또는 진단받은 질환명', help: '예: 항우울제, 수면제', sensitive: true, mapsTo: 'medication_diagnosis' },
      { id: 'experience', type: 'single', label: '심리상담 경험', options: ['있음', '없음'], mapsTo: 'counseling_experience' },
      { id: 'channel', type: 'short', label: '추가 업로드 가능한 채널', required: true, help: '예: 다이렉트 웨딩카페, 인스타그램 릴스 등' },
      {
        id: 'expectation', type: 'long', label: '상담에서 기대하는 부분', mapsTo: 'expectation',
        help: '다루었으면 하는 내용이나 궁금한 점을 적어 주세요. 따로 없으면 검사 결과 전반에 대한 해석을 중심으로 진행됩니다.\n예: 결혼 전에 다툼을 예방하고 잘 맞는 소통 방식을 찾고 싶어요.',
      },
    ],
  },
}

// 상담메인 신청서 (11-04): 로컬 상담 어드민에서 만든 "[상담메인] STS 커플상담 신청서" 3판에서
// 제3자 제공 동의 본문을 THIRD_PARTY_HELP 로, 업체 안내를 "제공받는 업체 정보" 블록으로 바꾼 판. 서랍 시드(S2·T1~T5)가 이 관리코드를 쓴다
export const SEED_MAIN_FORM_MANAGE_CODE = 'STS-CPL-R'
// 상담메인 신청서 문구 (10-30 건우님 판에서 가져옴)
const INTRO = "안녕하세요, 인싸이트 심리검사연구소입니다.\n상담 예약을 위해 아래 정보수집 동의 및 신청서를 작성해 주세요."
const REFUND = "① 커플상담은 전자상거래법 제 17조 제2항의 \"불가분적 용역\"에 해당하는 서비스로 상담 일정 예약 후 환불이 불가합니다. 상담 예약 시 일정을 충분히 고려해 주시기 바랍니다.\n\n② 상담 예약 후에는 검사 실시 여부와 무관하게 검사 및 상담 비용의 부분 환불이 불가합니다.\n\n③ 사전 연락 없이 상담에 참여하지 않은 경우, 또는 당일 상담에 15분 이상 늦게 도착한 경우 상담이 취소되며 환불이 불가합니다.\n\n※ 일정 변경을 희망할 경우 상담센터로 직접 일정 변경을 요청해 주시기 바랍니다.\n상담일 전날 오후 4시까지 일정 변경 가능합니다."
const GUIDE = "상담에 참여하시는 분의 정보를 작성해 주세요.\n상담센터에서 영업일 기준 7일 이내에 연락드립니다.\n\n※ 모든 상담은 비밀보장을 원칙으로 하며, 신청자의 동의 없이 외부로 유출되지 않습니다.\n다만 생명이나 안전에 심각한 위험이 있는 경우(예: 자살 위험 등)에는 예외가 적용될 수 있습니다."
const SENSITIVE = "복용 중인 약물·진단받은 질환은 건강에 관한 민감정보입니다.\n동의하시면 아래 해당 문항에 적을 수 있고, 동의하지 않아도 상담을 신청할 수 있습니다.\n\n1.보유·이용 기간: 상담 서비스 제공 종료 후 2주"
const EXPECTATION = "다루었으면 하는 내용이나 궁금한 점을 적어 주세요. 따로 없으면 검사 결과 전반에 대한 해석을 중심으로 진행됩니다.\n예: 결혼 전에 다툼을 예방하고 잘 맞는 소통 방식을 찾고 싶어요."

export const SEED_MAIN_FORM: { name: string; definition: FormDefinition } = {
  name: '[상담메인] STS 커플상담 신청서',
  // 11-10 단계형 화면에 맞춘 판: 동의는 맨 앞(시작 화면에서 한 번에), 예약 질문 먼저, 상담 준비 질문은 뒤.
  // 기간 질문 하나로 커플·예비부부·부부를 함께 받고, 이야기 주제를 고르면 그 주제가 갈등 기간 질문 제목에 들어간다
  definition: {
    intro: INTRO,
    fields: [
      { id: 'consent_third_party', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party', help: THIRD_PARTY_HELP },
      { id: 'f15', type: 'consent', label: '취소 및 환불 규정 확인', required: true, consentKind: 'refund', help: REFUND },
      { id: 'center_info', type: 'providers', label: '제공받는 업체 정보' },
      { id: 'guide', type: 'section', label: '상담 신청서 작성 안내', help: GUIDE },
      {
        id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true, mapsTo: 'preferred_schedule',
        availability: {
          ...DEFAULT_AVAILABILITY,
          labels: {
            method: '상담은 어떻게 받으실래요?',
            pick: '상담받기 편한 시간을 모두 골라 주세요. 많이 고를수록 예약이 빨리 잡혀요',
            start: '언제부터 상담받을 수 있나요?',
            contact: '상담센터 연락은 언제가 편하세요?',
          },
        },
      },
      { id: 'residence', type: 'short', label: '지금 사시는 지역을 알려 주세요', help: '대면 상담 센터를 정할 때 참고해요', placeholder: '서울 마포구', mapsTo: 'residence' },
      { id: 'name', type: 'short', label: '신청하시는 분 성함을 알려 주세요', help: '신청하시는 한 분의 성함만 적어 주세요', required: true, mapsTo: 'client_name' },
      { id: 'birth', type: 'date', label: '생년월일을 알려 주세요', help: '커플 중 대표 한 분', required: true, mapsTo: 'client_birth' },
      // 11-10 검수: "두 분은 어떤 사이인가요?"는 뺀다. 아래 기간 질문의 답(연애 1년, 결혼 3년)이 관계까지 알려 준다
      { id: 'dating', type: 'short', label: '연애 기간 또는 결혼 기간을 작성해 주세요', help: '커플 예: 1년\n부부 예: 연애 1년, 결혼 3년', required: true },
      { id: 'topics', type: 'multi', label: '이야기하고 싶은 주제를 선택해 주세요', options: ['소통', '가치관', '대인관계 (예: 여사친·남사친)', '경제적 문제'], other: true },
      {
        id: 'conflict_span', type: 'single', label: '{{topics}}에 대해 갈등이 있었다면, 지속된 기간을 알려 주세요',
        options: ['최근 3개월 이내', '3개월~6개월 이내', '6개월~1년 이내', '1년~3년 이내', '3년 이상', '잘 모르겠음'],
        showIf: { field: 'topics' },
      },
      // 11-10 검수: 길게 써도 된다는 것이 보이게 장문형(4줄 칸)으로
      { id: 'reason', type: 'long', label: '상담을 신청하신 이유가 있나요?', help: '적어 주시면 상담사가 미리 준비해요', mapsTo: 'reason' },
      { id: 'consent_sensitive', type: 'consent', label: '민감정보 수집·이용 동의(선택)', consentKind: 'sensitive', help: SENSITIVE },
      { id: 'drug', type: 'long', label: '복용 중인 약이나 진단받은 질환이 있나요?', help: '예: 항우울제, 수면제', sensitive: true, mapsTo: 'medication_diagnosis' },
      { id: 'experience', type: 'single', label: '심리상담을 받아 본 적 있나요?', options: ['있음', '없음'], mapsTo: 'counseling_experience' },
      { id: 'expectation', type: 'long', label: '상담에서 기대하는 부분이 있나요?', help: EXPECTATION, mapsTo: 'expectation' },
    ],
  },
}
