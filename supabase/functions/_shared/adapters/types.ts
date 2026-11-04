import type { CounselSessionRow } from '../core/counselBooking.ts'
import type { ConsentRecord, FormDefinition, Provider } from '../core/counselForm.ts'

export interface SmsAdapter {
  sendOtp(req: { messageId: string; toPhone: string; code: string }): Promise<{ accepted: boolean }>
}
export interface MessageAdapter {
  send(req: {
    messageId: string
    purpose: 't1_box' | 't2_forward' | 't3_counsel' | 'phone_change_notice' | 'cancel_notice'
    toPhone: string
    templateCode: string
    variables: Record<string, string>
    buttonUrl?: string
    fallbackSms: boolean
  }): Promise<{ accepted: boolean }>
}
export type Adapters = { sms: SmsAdapter; message: MessageAdapter }

// 상담 어드민(상담 원장)으로 가는 연결 통로 (B2). 템플릿 가져오기, 신청서 넘기기, 예약 상태 묻기(11-04).
// 지금은 상담 어드민 DB 가 따로 있어 그 DB 의 서랍 전용 함수를 부르고, 두 DB 가 합쳐지면 안쪽만 바꾼다.
export type CounselFormRef = { templateId: string; version: number; flow: 'counsel_first'; definition: FormDefinition; providers: Provider[] }
export type CounselSubmission = {
  naver_product_order_id: string
  external_order_id: string
  manage_code: string
  product_name: string
  template_id: string
  template_version: number
  submitted_at: string
  application: Record<string, string | boolean>
  extra: { id: string; label: string; value: string }[]
  sensitive_extra: { id: string; label: string; value: string }[]
  consents: ConsentRecord[]
}
export interface CounselAdapter {
  formFor(manageCode: string): Promise<CounselFormRef | null>
  // 같은 상품주문번호로 다시 보내도 원장에는 한 건 (created = false)
  submit(s: CounselSubmission): Promise<{ purchaseId: string; created: boolean }>
  // 구매 건들의 회차 줄(상태·예약 일시·센터 이름). 판정은 core/counselBooking.bookingOf
  status(purchaseIds: string[]): Promise<CounselSessionRow[]>
  // 도움말(10-30): rpc_seorap_help 원시 응답. 검사는 core/helpContent.normalizeHelp 가 한다
  help(): Promise<unknown>
}
