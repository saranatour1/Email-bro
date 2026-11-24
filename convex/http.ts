import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { env, httpAction } from './_generated/server'
import { finishConnect, settingsUrl } from './models/mailboxes/gmail/connect'
import { settingsError } from './lib/oauthError'
import { parseRaw } from './lib/mail'
import { encrypt, inboundSecretFor, sha256 } from './lib/crypto'

const http = httpRouter()

// Google redirects here after the user grants Gmail access.
http.route({
  path: '/gmail/callback',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) {
      return Response.redirect(settingsUrl(`error=${settingsError(url.searchParams.get('error'))}`))
    }
    try {
      return Response.redirect(await finishConnect(ctx, code, state))
    } catch (e) {
      // Land back on the app with a readable reason instead of a raw error page.
      console.error('Gmail connect failed', e)
      const reason = String(e).includes('SERVICE_DISABLED') ? 'gmail_api_disabled' : 'connect_failed'
      return Response.redirect(settingsUrl(`error=${reason}`))
    }
  }),
})

// Same length and timing whatever the inputs, so a wrong secret reveals nothing about the right one.
const sameSecret = async (a: string, b: string) =>
  (await sha256(new TextEncoder().encode(a))) === (await sha256(new TextEncoder().encode(b)))

// Each user's inbound Worker posts each raw message here with that user's own secret. The shared Worker in
// workers/inbound may still send INBOUND_SECRET itself.

http.route({
  path: '/inbound/email',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!env.INBOUND_SECRET) return new Response('Unauthorized', { status: 401 })
    const auth = req.headers.get('Authorization') ?? ''
    const to = req.headers.get('X-Envelope-To')
    if (!to) return new Response('Missing X-Envelope-To', { status: 400 })
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.getByAddress, { address: to })
    // A user's secret only opens their own mailboxes.
    const allowed =
      (await sameSecret(auth, `Bearer ${env.INBOUND_SECRET}`)) ||
      (!!mailbox && (await sameSecret(auth, `Bearer ${await inboundSecretFor(mailbox.userId)}`)))
    if (!allowed) return new Response('Unauthorized', { status: 401 })
    // 403 makes the Worker turn the message away politely instead of failing.
    if (!mailbox || mailbox.provider !== 'domain') {
      return new Response("This address isn't accepting mail right now.", { status: 403 })
    }

    const raw = new Uint8Array(await req.arrayBuffer())
    const mail = await parseRaw(raw)
    const { iv, data } = await encrypt(raw, mailbox.userId)
    const fileId = await ctx.storage.store(new Blob([data]))
    const messageId = await ctx.runMutation(internal.models.messages.ingest.ingest, {
      mailboxId: mailbox._id,
      // A retried delivery without a Message-ID still dedupes on the content hash.
      externalId: mail.rfcMessageId ?? (await sha256(raw)),
      mail: {
        rfcMessageId: mail.rfcMessageId,
        fromName: mail.fromName,
        subject: mail.subject,
        receivedAt: mail.receivedAt,
        raw: { fileId, iv, perUser: true },
      },
    })
    if (!messageId) await ctx.storage.delete(fileId)
    return new Response('ok')
  }),
})

export default http
