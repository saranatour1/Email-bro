import { ConvexError, v } from 'convex/values'
import { sendEmail } from '@sarant/cloudflare-email-component'
import { components, internal } from '../../_generated/api'
import { userAction } from '../../lib/functions'
import { resendEmail } from '../../lib/resend'
import { sendGmail } from '../../lib/gmail'
import { cloudflareCredentials } from '../../lib/cloudflare'
import { seal } from '../../lib/crypto'
import { COPY_TTL_MS } from '../cloudflareAccounts/manage'
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
    const threading: Record<string, string> = mail.inReplyTo
      ? { 'In-Reply-To': mail.inReplyTo, References: mail.inReplyTo }
      : {}

    if (mailbox.provider === 'gmail') {
      await sendGmail(ctx, mailbox._id, buildMime(mail), message.threadId)
    } else if (mailbox.sendVia === 'resend') {
      await resendEmail({ from: mail.from, to: [mail.to], subject: mail.subject, text, headers: threading })
    } else {
      // The user's own Cloudflare account. The component keeps a copy sealed with the user's key, for COPY_TTL_MS.
      const cf = await cloudflareCredentials(ctx, ctx.userId)
      const owner = ctx.userId
      const result = await sendEmail(ctx, components.cloudflareEmail, {
        owner,
        accountId: cf.accountId,
        apiToken: cf.apiToken,
        email: { from: mail.from, to: mail.to, subject: mail.subject, text, headers: threading },
        seal: (plain) => seal(owner, 'mail-copy', plain),
      })
      await ctx.scheduler.runAfter(COPY_TTL_MS, internal.models.cloudflareAccounts.manage.forgetCopy, {
        owner,
        emailId: result.emailId,
      })
      if (result.error) throw new ConvexError(`Cloudflare didn't send it: ${result.error}`)
    }
  },
})

export const sendApi = { reply }
