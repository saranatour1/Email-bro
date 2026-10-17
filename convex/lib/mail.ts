import PostalMime, { addressParser, decodeWords } from 'postal-mime'
import type { Address } from 'postal-mime'

// Parsed in memory only; never stored.
export type ParsedMail = {
  rfcMessageId?: string
  from: string
  fromName: string
  replyTo?: string
  to: Array<string>
  subject: string
  text: string
  html?: string
  receivedAt: number
}

const flatten = (list: Array<Address> = []) =>
  list.flatMap((a) => (a.group ? a.group : [a])).map((a) => a.address.toLowerCase())

// The display name, or the sender's domain when there is none, so no address is ever stored.
export const senderName = (name: string | undefined, address: string) =>
  name?.trim() || address.split('@')[1] || 'Unknown sender'

// Parses a raw `From:` header value, e.g. from Gmail's metadata format.
export const parseSender = (header: string) => {
  const first = addressParser(header, { flatten: true }).at(0)
  return senderName(decodeWords(first?.name ?? ''), first?.address ?? '')
}

export const decodeHeader = (value: string) => decodeWords(value).trim()

// shortcut: regex tag stripping for HTML-only mail when a plain-text copy is needed (triage).
const htmlToText = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')

export const parseRaw = async (raw: ArrayBuffer | Uint8Array): Promise<ParsedMail> => {
  const mail = await PostalMime.parse(raw)
  const from = mail.from && !mail.from.group ? mail.from : undefined
  const replyTo = mail.replyTo?.flatMap((a) => (a.group ? a.group : [a]))[0]
  const date = mail.date ? Date.parse(mail.date) : NaN
  return {
    rfcMessageId: mail.messageId,
    from: from?.address.toLowerCase() ?? '',
    fromName: senderName(from?.name, from?.address ?? ''),
    replyTo: replyTo?.address.toLowerCase(),
    to: flatten(mail.to),
    subject: mail.subject?.trim() || '(no subject)',
    text: (mail.text ?? htmlToText(mail.html ?? '')).trim(),
    html: mail.html,
    receivedAt: Number.isNaN(date) ? Date.now() : date,
  }
}

export const base64UrlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export const bytesToBase64Url = (bytes: Uint8Array): string => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const utf8Base64 = (s: string) => bytesToBase64Url(new TextEncoder().encode(s)).replace(/-/g, '+').replace(/_/g, '/')

// Plain-text RFC 5322 message; non-ASCII subject/body are base64-encoded.
export const buildMime = (m: {
  from: string
  to: string
  subject: string
  text: string
  inReplyTo?: string
}): string => {
  const headers = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: =?UTF-8?B?${utf8Base64(m.subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
  ]
  return `${headers.join('\r\n')}\r\n\r\n${utf8Base64(m.text).replace(/.{76}/g, '$&\r\n')}`
}

export const replySubject = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`)
