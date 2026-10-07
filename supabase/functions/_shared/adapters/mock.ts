import type { SupabaseClient } from '@supabase/supabase-js'
import { t } from '../core/copy.ko.ts'
import { last4 } from '../core/phone.ts'
import { isDevEnv } from '../env.ts'
import type { Adapters } from './types.ts'

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
