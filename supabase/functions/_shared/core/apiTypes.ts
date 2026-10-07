import type { LineStatus } from './lineStatus.ts'

export type ErrorCode =
  | 'OTP_WRONG' | 'OTP_EXPIRED' | 'OTP_LOCKED' | 'RATE_LIMITED' | 'LINK_INVALID' | 'LINK_REVOKED'
  | 'SESSION_EXPIRED' | 'REAUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_OWNER' | 'CONFLICT' | 'LIMIT_EXCEEDED'
  | 'VALIDATION' | 'UPSTREAM_FAILED' | 'MAINTENANCE'
export type ApiErrorBody = { error: { code: ErrorCode; extra?: Record<string, unknown> } }

export type EntryResponse = { nameMasked: string; phoneMasked: string; noticeBanner: string | null }
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
export type BoxResponse = { ownerName: string; notStartedCount: number; noticeBanner: string | null; groups: BoxGroup[] }

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

export type LaunchResponse = { url: string }
export type CodeResponse = { code: string }
export type ForwardResponse = { forwardId: string; created: boolean }
export type DirectShareResponse = { text: string; url: string }
export type DevOutboxItem = { id: string; createdAt: string; kind: 'sms' | 'alimtalk'; toLast4: string; body: string }
