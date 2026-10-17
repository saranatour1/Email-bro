import { env } from '../_generated/server'
import { base64UrlToBytes, bytesToBase64Url } from './mail'

const key = async () => {
  if (!env.MAIL_ENCRYPTION_KEY) throw new Error('MAIL_ENCRYPTION_KEY is not set')
  return crypto.subtle.importKey('raw', base64UrlToBytes(env.MAIL_ENCRYPTION_KEY), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export const encrypt = async (data: Uint8Array<ArrayBuffer>) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), data)
  return { iv: bytesToBase64Url(iv), data: new Uint8Array(cipher) }
}

export const decrypt = async (data: ArrayBuffer, iv: string) =>
  new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(iv) }, await key(), data))

export const sha256 = async (data: Uint8Array<ArrayBuffer>) =>
  bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
