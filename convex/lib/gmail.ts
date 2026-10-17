import { internal } from '../_generated/api'
import { env } from '../_generated/server'
import { bytesToBase64Url } from './mail'
import type { ActionCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

export const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export const sendGmail = async (ctx: ActionCtx, mailboxId: Id<'mailboxes'>, mime: string, threadId?: string) => {
  const token = await accessToken(ctx, mailboxId)
  await gmailFetch(token, '/messages/send', { raw: bytesToBase64Url(new TextEncoder().encode(mime)), threadId })
}

export const accessToken = async (ctx: ActionCtx, mailboxId: Id<'mailboxes'>): Promise<string> => {
  const secret = await ctx.runQuery(internal.models.mailboxes.gmail.connect.getSecret, { mailboxId })
  if (!secret) throw new Error('Mailbox has no credentials; reconnect it')
  if (secret.accessToken && (secret.expiresAt ?? 0) > Date.now() + 60_000) return secret.accessToken
  const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: secret.refreshToken })
  await ctx.runMutation(internal.models.mailboxes.gmail.connect.saveAccessToken, {
    mailboxId,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  })
  return tokens.access_token
}

export const tokenRequest = async (params: Record<string, string>) => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  })
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`)
  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string }
}

export const gmailFetch = async (token: string, path: string, body?: unknown): Promise<unknown> => {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gmail ${path.split('?')[0]} ${res.status}: ${await res.text()}`)
  return await res.json()
}
