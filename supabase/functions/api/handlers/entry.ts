import type { EntryResponse } from '../../_shared/core/apiTypes.ts'
import { maskPhone } from '../../_shared/core/phone.ts'
import { decrypt } from '../../_shared/crypto.ts'
import { json, readJson } from '../lib/http.ts'
import { findBoxLink } from '../lib/links.ts'
import { getSettings } from '../lib/settings.ts'

export async function entry(req: Request): Promise<Response> {
  const { token } = await readJson<{ token: unknown }>(req)
  const { recipient } = await findBoxLink(token)
  const s = await getSettings()
  const body: EntryResponse = {
    nameMasked: recipient.name_masked ?? '',
    phoneMasked: maskPhone(await decrypt('A', recipient.phone_enc)),
    noticeBanner: s.notice_banner,
  }
  return json(200, body)
}
