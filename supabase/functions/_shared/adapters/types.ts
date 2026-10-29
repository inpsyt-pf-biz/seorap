import type { FormDefinition } from '../core/counselForm.ts'

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

// 상담 어드민(상담 원장)으로 가는 연결 통로 (B2). 템플릿 가져오기와 신청서 넘기기 두 가지만 한다.
// 지금은 상담 어드민 DB 가 따로 있어 그 DB 의 서랍 전용 함수를 부르고, 두 DB 가 합쳐지면 안쪽만 바꾼다.
export type CounselFormRef = { templateId: string; version: number; flow: 'counsel_first'; definition: FormDefinition }
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
  consents: { id: string; label: string; kind: string; agreed: boolean }[]
}
export interface CounselAdapter {
  formFor(manageCode: string): Promise<CounselFormRef | null>
  // 같은 상품주문번호로 다시 보내도 원장에는 한 건 (created = false)
  submit(s: CounselSubmission): Promise<{ purchaseId: string; created: boolean }>
}
