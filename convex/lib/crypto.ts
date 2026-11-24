import { env } from '../_generated/server'
import { base64UrlToBytes, bytesToBase64Url } from './mail'

const masterKey = () => {
  if (!env.MAIL_ENCRYPTION_KEY) throw new Error('MAIL_ENCRYPTION_KEY is not set')
  return base64UrlToBytes(env.MAIL_ENCRYPTION_KEY)
}

// The deployment-wide key: domain mail stored before keys were per user.
const legacyKey = () => crypto.subtle.importKey('raw', masterKey(), 'AES-GCM', false, ['encrypt', 'decrypt'])

// What a per-user key protects. Each purpose gets its own key, so one can't open another's data.
export type Purpose = 'mail' | 'cloudflare' | 'mail-copy'

// A key only this user's data is encrypted with, derived from the master key (HKDF-SHA-256).
const userKey = async (userId: string, purpose: Purpose) => {
  const base = await crypto.subtle.importKey('raw', masterKey(), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(`email-bro/${purpose}/${userId}`),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// Encrypts for one user. Without `userId` it uses the legacy deployment-wide key.
export const encrypt = async (data: Uint8Array<ArrayBuffer>, userId?: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = userId ? await userKey(userId, 'mail') : await legacyKey()
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return { iv: bytesToBase64Url(iv), data: new Uint8Array(cipher) }
}

export const decrypt = async (data: ArrayBuffer, iv: string, userId?: string) => {
  const key = userId ? await userKey(userId, 'mail') : await legacyKey()
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(iv) }, key, data))
}

// Text sealed for one user as "<iv>.<ciphertext>", both base64url: for strings stored in the database.
export const seal = async (userId: string, purpose: Purpose, text: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await userKey(userId, purpose),
    new TextEncoder().encode(text),
  )
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipher))}`
}

export const unseal = async (userId: string, purpose: Purpose, sealed: string) => {
  const [iv, cipher] = sealed.split('.')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
    await userKey(userId, purpose),
    base64UrlToBytes(cipher),
  )
  return new TextDecoder().decode(plain)
}

// The secret one user's inbound Worker sends: an HMAC of their user id under INBOUND_SECRET. It lives in the user's
// own Cloudflare account, so it must only ever unlock that user's mailboxes.
export const inboundSecretFor = async (userId: string) => {
  if (!env.INBOUND_SECRET) throw new Error('INBOUND_SECRET is not set')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.INBOUND_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`email-bro/inbound/${userId}`))
  return bytesToBase64Url(new Uint8Array(mac))
}

export const sha256 = async (data: Uint8Array<ArrayBuffer>) =>
  bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
