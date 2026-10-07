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
