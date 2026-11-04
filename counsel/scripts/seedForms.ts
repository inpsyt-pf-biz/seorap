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
export const SEED_MAIN_FORM: { name: string; definition: FormDefinition } = {
  "name": "[상담메인] STS 커플상담 신청서",
  "definition": {
    "intro": "안녕하세요, 인싸이트 심리검사연구소입니다.\n상담 예약을 위해 아래 정보수집 동의 및 신청서를 작성해 주세요.",
    "fields": [
      {
        "id": "consent_third_party",
        "help": THIRD_PARTY_HELP,
        "type": "consent",
        "label": "개인정보 제3자 제공 동의",
        "required": true,
        "consentKind": "third_party"
      },
      {
        "id": "consent_sensitive",
        "help": "복용 중인 약물·진단받은 질환은 건강에 관한 민감정보입니다.\n동의하시면 아래 해당 문항에 적을 수 있고, 동의하지 않아도 상담을 신청할 수 있습니다.\n\n1.보유·이용 기간: 상담 서비스 제공 종료 후 2주",
        "type": "consent",
        "label": "민감정보 수집·이용 동의(선택)",
        "consentKind": "sensitive"
      },
      {
        "id": "center_info",
        "type": "providers",
        "label": "제공받는 업체 정보"
      },
      {
        "id": "guide",
        "help": "상담에 참여하시는 분의 정보를 작성해 주세요.\n상담센터에서 영업일 기준 7일 이내에 연락드립니다.\n\n※ 모든 상담은 비밀보장을 원칙으로 하며, 신청자의 동의 없이 외부로 유출되지 않습니다.\n다만 생명이나 안전에 심각한 위험이 있는 경우(예: 자살 위험 등)에는 예외가 적용될 수 있습니다.",
        "type": "section",
        "label": "상담 신청서 작성 안내"
      },
      {
        "id": "name",
        "help": "커플 중 대표자 1인",
        "type": "short",
        "label": "성함",
        "mapsTo": "client_name",
        "required": true
      },
      {
        "id": "birth",
        "help": "커플 중 대표자 1인",
        "type": "date",
        "label": "생년월일",
        "mapsTo": "client_birth",
        "required": true
      },
      {
        "id": "residence",
        "type": "short",
        "label": "현재 거주지",
        "mapsTo": "residence"
      },
      {
        "id": "dating",
        "help": "예: 1년",
        "type": "short",
        "label": "연애 기간",
        "required": true
      },
      {
        "id": "wedding",
        "type": "single",
        "label": "현재 결혼 예정이신가요?",
        "options": [
          "결혼 예정입니다.",
          "아닙니다."
        ],
        "required": true
      },
      {
        "id": "reason",
        "type": "short",
        "label": "상담을 신청하신 이유",
        "mapsTo": "reason"
      },
      {
        "id": "when",
        "type": "availability",
        "label": "상담 가능한 시간대",
        "mapsTo": "preferred_schedule",
        "required": true,
        "availability": {
          "days": [
            {
              "id": "weekday",
              "label": "평일"
            },
            {
              "id": "sat",
              "label": "토요일"
            },
            {
              "id": "sun",
              "label": "일요일"
            }
          ],
          "slots": [
            {
              "id": "morning",
              "hours": "9~12시",
              "label": "오전"
            },
            {
              "id": "afternoon",
              "hours": "12~18시",
              "label": "오후"
            },
            {
              "id": "evening",
              "hours": "18~21시",
              "label": "저녁"
            }
          ],
          "methods": [
            "대면",
            "화상",
            "상관없음"
          ],
          "askStartDate": true,
          "contactTimes": [
            "평일 오전",
            "평일 오후",
            "평일 저녁",
            "상관없음"
          ]
        }
      },
      {
        "id": "drug",
        "help": "예: 항우울제, 수면제",
        "type": "long",
        "label": "현재 복용하고 있는 약물 또는 진단받은 질환명",
        "mapsTo": "medication_diagnosis",
        "sensitive": true
      },
      {
        "id": "experience",
        "type": "single",
        "label": "심리상담 경험",
        "mapsTo": "counseling_experience",
        "options": [
          "있음",
          "없음"
        ]
      },
      {
        "id": "expectation",
        "help": "다루었으면 하는 내용이나 궁금한 점을 적어 주세요. 따로 없으면 검사 결과 전반에 대한 해석을 중심으로 진행됩니다.\n예: 결혼 전에 다툼을 예방하고 잘 맞는 소통 방식을 찾고 싶어요.",
        "type": "long",
        "label": "상담에서 기대하는 부분",
        "mapsTo": "expectation"
      },
      {
        "id": "f15",
        "help": "① 커플상담은 전자상거래법 제 17조 제2항의 \"불가분적 용역\"에 해당하는 서비스로 상담 일정 예약 후 환불이 불가합니다. 상담 예약 시 일정을 충분히 고려해 주시기 바랍니다.\n\n② 상담 예약 후에는 검사 실시 여부와 무관하게 검사 및 상담 비용의 부분 환불이 불가합니다.\n\n③ 사전 연락 없이 상담에 참여하지 않은 경우, 또는 당일 상담에 15분 이상 늦게 도착한 경우 상담이 취소되며 환불이 불가합니다.\n\n※ 일정 변경을 희망할 경우 상담센터로 직접 일정 변경을 요청해 주시기 바랍니다.\n상담일 전날 오후 4시까지 일정 변경 가능합니다.",
        "type": "consent",
        "label": "취소 및 환불 규정 확인",
        "required": true,
        "consentKind": "other"
      }
    ]
  }
}
