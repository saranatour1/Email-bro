import { v } from 'convex/values'
import { start } from '@convex-dev/workflow'
import { internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import schema from '../../schema'

export const ingest = internalMutation({
  args: {
    mailboxId: v.id('mailboxes'),
    externalId: v.string(),
    threadId: v.optional(v.string()),
    mail: schema.tables.messages.validator.pick('rfcMessageId', 'fromName', 'subject', 'receivedAt', 'raw'),
  },
  returns: v.union(v.id('messages'), v.null()),
  handler: async (ctx, { mailboxId, externalId, threadId, mail }) => {
    const mailbox = await ctx.db.get('mailboxes', mailboxId)
    if (!mailbox) return null
    const dupe = await ctx.db
      .query('messages')
      .withIndex('by_mailboxId_and_externalId', (q) => q.eq('mailboxId', mailboxId).eq('externalId', externalId))
      .first()
    if (dupe) return null
    const messageId = await ctx.db.insert('messages', {
      ...mail,
      userId: mailbox.userId,
      mailboxId,
      externalId,
      threadId,
      read: false,
      status: 'inbox',
    })
    await start(ctx, internal.models.messages.triage.triageMessage, { messageId })
    return messageId
  },
})

export const existingExternalIds = internalQuery({
  args: { mailboxId: v.id('mailboxes'), externalIds: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { mailboxId, externalIds }) => {
    const found: Array<string> = []
    for (const externalId of externalIds) {
      const row = await ctx.db
        .query('messages')
        .withIndex('by_mailboxId_and_externalId', (q) => q.eq('mailboxId', mailboxId).eq('externalId', externalId))
        .first()
      if (row) found.push(externalId)
    }
    return found
  },
})
