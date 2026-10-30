import type { FormDefinition } from './counselForm.ts'
import type { LineStatus } from './lineStatus.ts'

export type ErrorCode =
  | 'OTP_WRONG' | 'OTP_EXPIRED' | 'OTP_LOCKED' | 'RATE_LIMITED' | 'LINK_INVALID' | 'LINK_REVOKED'
  | 'SESSION_EXPIRED' | 'REAUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_OWNER' | 'CONFLICT' | 'LIMIT_EXCEEDED'
  | 'VALIDATION' | 'UPSTREAM_FAILED' | 'MAINTENANCE' | 'PIN_WRONG' | 'PIN_LOCKED'
export type ApiErrorBody = { error: { code: ErrorCode; extra?: Record<string, unknown> } }

// hasPin: PIN 으로 들어올 수 있는 서랍, pinLocked: 5번 틀려 OTP 만 남은 서랍
export type EntryResponse = { nameMasked: string; phoneMasked: string; noticeBanner: string | null; hasPin: boolean; pinLocked: boolean }
export type PinResponse = { ok: true }
export type OtpRequestResponse = { expiresAt: string; resendAt: string }
export type OtpVerifyResponse = { ok: true }

export type BoxLine = {
  voucherId: string
  testItemId: string
  testName: string
  unitNo: number
  unitsOfTest: number
  status: LineStatus
  firstLaunchedAt: string | null
  forwardTo: { name: string; phone: string } | null
}
export type BoxGroup = { orderId: string; purchasedAt: string; productName: string; lineCount: number; done: boolean; lines: BoxLine[] }
// 상담이 든 주문마다 하나 (B2). submitted 면 "제출 완료" 카드
export type CounselCard = { orderId: string; productName: string; submitted: boolean; submittedAt: string | null }
// pinSet 이 false 면 화면이 PIN 설정으로 보낸다 (OTP 로 들어와 PIN 을 아직 정하지 않은 경우)
// 설정 화면: 지금 닉네임과, 닉네임이 없을 때 받는 분에게 보이는 이름(가린 실명)
export type ProfileResponse = { nickname: string | null; defaultName: string }
export type BoxResponse = {
  ownerName: string; notStartedCount: number; noticeBanner: string | null; pinSet: boolean; counsel: CounselCard[]; groups: BoxGroup[]
}
export type CounselFormResponse = { orderId: string; productName: string; templateId: string; version: number; definition: FormDefinition }
export type CounselSubmitResponse = { submitted: true }

export type HistoryResult = 'delivered_alimtalk' | 'delivered_sms' | 'sending' | 'failed'
export type HistoryItem = {
  id: string
  at: string
  action: 'forward' | 'resend' | 'cancel' | 'direct_share'
  testName: string
  unitNo: number
  toName: string | null
  toPhone: string | null
  result: HistoryResult | null
  openedAt: string | null
}
export type HistoryResponse = { items: HistoryItem[] }

// 받는 분 1매 화면. 보낸 분 번호·같은 주문의 다른 검사·코드는 담지 않는다 (build-spec §4-7)
export type ForwardPageResponse = { senderName: string; testName: string; launched: boolean; contact: string }
export type HelpResponse = { contact: string }
export type LaunchResponse = { url: string }
export type CodeResponse = { code: string }
export type ForwardResponse = { forwardId: string; created: boolean }
export type DirectShareResponse = { text: string; url: string }
export type DevOutboxItem = { id: string; createdAt: string; kind: 'sms' | 'alimtalk'; toLast4: string; body: string }
