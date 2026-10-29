// 시드 신청서 템플릿: 현재 쓰는 Google 설문지 "[협찬] STS 커플상담 신청서"(Works-archive counsel-form-google-2026-10-28.md)를
// 서랍 템플릿으로 옮긴 것. 바꾼 점: 연락처 문항은 뺀다(서랍이 이미 안다), 희망 예약일은 "가능 시간대" 문항으로,
// 복용 약물은 민감정보로 표시하고 민감정보 선택 동의를 더한다(01-plan §0 10-07·10-29).
import { DEFAULT_AVAILABILITY, type FormDefinition } from '../../supabase/functions/_shared/core/counselForm.ts'

// 서랍 시드 S2(검사 + 상담 주문)의 관리코드와 같게 맞춘다
export const SEED_FORM_MANAGE_CODE = 'STS-CPL-S'

export const SEED_FORM: { name: string; definition: FormDefinition } = {
  name: '[협찬] STS 커플상담 신청서',
  definition: {
    intro: '안녕하세요, 인싸이트 심리검사연구소입니다.\n원활한 상담 진행을 위해 아래 문답에 성실히 답변해 주시기 바랍니다.',
    fields: [
      {
        id: 'consent_third_party', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party',
        help: "서울마인드브릿지 심리상담센터(이하 '상담센터')는 개인정보보호법에 따라 본인(신청자)의 동의를 얻어 인싸이트 공식스토어 상담 서비스 제공을 위한 개인정보를 수집·이용합니다.\n본 약관에 동의하지 않을 수 있으나 이 경우 서비스 제공이 불가능합니다.\n\n1. 제공받는 자: 서울마인드브릿지 심리상담센터\n2. 이용 목적: 상담 서비스 예약 및 제공\n3. 제공 항목: (공통) 이름, 생년월일, 연락처, 심리검사결과 / (미성년자) 주소, 보호자 성함, 보호자 연락처\n4. 보유·이용 기간: 상담 서비스 제공 종료 후 2주\n\n※ 서울마인드브릿지 심리상담센터는 인싸이트 심리검사연구소의 직영 상담센터입니다.",
      },
      {
        id: 'consent_sensitive', type: 'consent', label: '민감정보 수집·이용 동의(선택)', consentKind: 'sensitive',
        help: '복용 중인 약물·진단받은 질환은 건강에 관한 민감정보입니다. 동의하시면 아래 해당 문항에 적을 수 있고, 동의하지 않아도 상담을 신청할 수 있습니다.\n보유·이용 기간: 상담 서비스 제공 종료 후 2주',
      },
      {
        id: 'center_info', type: 'notice', label: '제공받는 업체 정보',
        help: '업체명: 서울마인드브릿지 심리상담센터\n전화번호: 02-332-5112 ~ 5113\n상담센터 예약 번호: 010-9738-5114\n주소: 서울특별시 마포구 동교로 23길 58 3층',
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
