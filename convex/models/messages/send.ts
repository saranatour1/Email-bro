import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { env } from '../../_generated/server'
import { userAction } from '../../lib/functions'
import { sendGmail } from '../../lib/gmail'
import { buildMime, replySubject } from '../../lib/mail'
import { loadMail } from './utils'

// Reply from the mailbox the message arrived in, through that mailbox's provider.
const reply = userAction({
  args: { messageId: v.id('messages'), text: v.string() },
  handler: async (ctx, { messageId, text }) => {
    if (!text.trim()) throw new ConvexError('Write something first')
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message || message.userId !== ctx.userId) throw new ConvexError('Message not found')
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId })
    if (!mailbox) throw new ConvexError('Mailbox not found')
    const original = await loadMail(ctx, message)

    const mail = {
      from: mailbox.address,
      to: original.replyTo ?? original.from,
      subject: replySubject(message.subject),
      text,
      inReplyTo: message.rfcMessageId,
    }
    const threading = mail.inReplyTo ? { 'In-Reply-To': mail.inReplyTo, References: mail.inReplyTo } : {}

    if (mailbox.provider === 'gmail') {
      await sendGmail(ctx, mailbox._id, buildMime(mail), message.threadId)
    } else if (mailbox.sendVia === 'resend') {
      if (!env.RESEND_API_KEY) throw new ConvexError('RESEND_API_KEY is not set')
      await post('https://api.resend.com/emails', env.RESEND_API_KEY, {
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        text,
        headers: threading,
      })
    } else {
      if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_EMAIL_TOKEN) {
        throw new ConvexError('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_EMAIL_TOKEN are not set')
      }
      await post(
        `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
        env.CLOUDFLARE_EMAIL_TOKEN,
        { from: mail.from, to: mail.to, subject: mail.subject, text, headers: threading },
      )
    }
  },
})

export const sendApi = { reply }

const post = async (url: string, token: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ConvexError(`Send failed (${res.status}): ${await res.text()}`)
}
