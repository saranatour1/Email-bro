import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { userAction } from '../../lib/functions'
import { loadMail } from './utils'

// Returns the email to the reader without storing it.
const read = userAction({
  args: { messageId: v.id('messages') },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message || message.userId !== ctx.userId) throw new ConvexError('Message not found')
    const { from, to, html, text } = await loadMail(ctx, message)
    return { from, to, html: html ?? null, text }
  },
})

export const readApi = { read }
