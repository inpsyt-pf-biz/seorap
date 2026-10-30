import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from '../core/copy.ko.ts'
import { last4 } from '../core/phone.ts'
import { isDevEnv } from '../env.ts'
import { DEFAULT_AVAILABILITY, type FormDefinition } from '../core/counselForm.ts'
import type { Adapters, CounselAdapter } from './types.ts'

// 가짜 문자·알림톡. SEORAP_ENV 가 local·preview 일 때만 만들 수 있다(허용 목록).
export function mockAdapters(db: SupabaseClient, mode: 'success' | 'fallback' | 'fail'): Adapters {
  if (!isDevEnv()) throw new Error('mock adapters are only allowed in local/preview')
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

// 가짜 상담 원장 (테스트용, 설정 counsel_mode = 'mock'). 관리코드 STS-CPL-S 에 작은 신청서가 연결돼 있고,
// MOCK-FAIL 은 신청서는 있지만 넘기기가 실패한다(원장 전달 실패 시 잠금을 풀지 않는지 확인용)
export const MOCK_COUNSEL_FORM: FormDefinition = {
  intro: '가짜 신청서',
  fields: [
    { id: 'c1', type: 'consent', label: '개인정보 제3자 제공 동의', required: true, consentKind: 'third_party' },
    { id: 'c2', type: 'consent', label: '민감정보 수집·이용 동의(선택)', consentKind: 'sensitive' },
    { id: 'name', type: 'short', label: '성함', required: true, mapsTo: 'client_name' },
    { id: 'nick', type: 'short', label: '닉네임' },
    { id: 'when', type: 'availability', label: '상담 가능한 시간대', required: true, mapsTo: 'preferred_schedule', availability: DEFAULT_AVAILABILITY },
    { id: 'drug', type: 'long', label: '복용 약물', sensitive: true, mapsTo: 'medication_diagnosis' },
  ],
}
export function mockCounsel(): CounselAdapter {
  if (!isDevEnv()) throw new Error('mock adapters are only allowed in local/preview')
  return {
    async formFor(manageCode) {
      if (manageCode !== 'STS-CPL-S' && manageCode !== 'MOCK-FAIL') return null
      return { templateId: '00000000-0000-4000-8000-00000000c0de', version: 1, flow: 'counsel_first', definition: MOCK_COUNSEL_FORM }
    },
    async submit(s) {
      if (s.manage_code === 'MOCK-FAIL') throw new Error('mock counsel submit failed')
      return { purchaseId: crypto.randomUUID(), created: true }
    },
    // 시험 모드에서는 어드민 내용이 없다고 본다 → 서랍은 기본 문구를 쓴다
    async help() {
      return null
    },
  }
}
