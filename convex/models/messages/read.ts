import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { userAction } from '../../lib/functions'
import { toCleanMarkdown } from '../../lib/markdown'
import { loadMail } from './utils'

// Returns the email, and the Markdown Jev reads, to the reader without storing either.
const read = userAction({
  args: { messageId: v.id('messages') },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message || message.userId !== ctx.userId) throw new ConvexError('Message not found')
    const mail = await loadMail(ctx, message)
    return { from: mail.from, to: mail.to, html: mail.html ?? null, text: mail.text, markdown: toCleanMarkdown(mail) }
  },
})

export const readApi = { read }
