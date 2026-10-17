import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internalQuery } from '../../_generated/server'
import { userQuery } from '../../lib/functions'
import schema from '../../schema'

const vMailbox = schema.doc('mailboxes')

const list = userQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) =>
    await ctx.db
      .query('mailboxes')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate(paginationOpts),
})

export const listApi = { list }

export const get = internalQuery({
  args: { mailboxId: v.id('mailboxes') },
  returns: v.union(vMailbox, v.null()),
  handler: (ctx, { mailboxId }) => ctx.db.get('mailboxes', mailboxId),
})

export const getByAddress = internalQuery({
  args: { address: v.string() },
  returns: v.union(vMailbox, v.null()),
  handler: (ctx, { address }) =>
    ctx.db
      .query('mailboxes')
      .withIndex('by_address', (q) => q.eq('address', address.toLowerCase()))
      .first(),
})
