import { ConvexError, v } from 'convex/values'
import { userMutation } from '../../lib/functions'

// Per-mailbox Gmail write-back switches. Changes apply to mail Jev sorts from now on.
const setGmailOptions = userMutation({
  args: { mailboxId: v.id('mailboxes'), autoLabel: v.optional(v.boolean()), autoArchive: v.optional(v.boolean()) },
  handler: async (ctx, { mailboxId, ...options }) => {
    const mailbox = await ctx.db.get('mailboxes', mailboxId)
    if (mailbox?.userId !== ctx.userId || mailbox.provider !== 'gmail') throw new ConvexError('Gmail mailbox not found')
    await ctx.db.patch('mailboxes', mailboxId, options)
  },
})

export const optionsApi = { setGmailOptions }
