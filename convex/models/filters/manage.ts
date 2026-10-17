import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internalQuery } from '../../_generated/server'
import { userMutation, userQuery } from '../../lib/functions'
import schema from '../../schema'
import type { MutationCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

const MAX_FILTERS = 50
const vRule = schema.tables.filters.validator.pick(
  'name',
  'mailboxId',
  'from',
  'subject',
  'route',
  'label',
  'status',
  'markRead',
)

const getOwned = async (ctx: MutationCtx & { userId: Id<'users'> }, filterId: Id<'filters'>) => {
  const filter = await ctx.db.get('filters', filterId)
  if (!filter || filter.userId !== ctx.userId) throw new ConvexError('Filter not found')
  return filter
}

const list = userQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) =>
    await ctx.db
      .query('filters')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate(paginationOpts),
})

const create = userMutation({
  args: vRule.fields,
  handler: async (ctx, rule) => {
    const name = rule.name.trim()
    const from = rule.from?.trim() || undefined
    const subject = rule.subject?.trim() || undefined
    if (!name || name.length > 80) throw new ConvexError('Give the filter a name (up to 80 characters)')
    // An empty rule would match every email.
    if (!from && !subject) throw new ConvexError('Add a From or Subject to match')
    if ((from?.length ?? 0) > 200 || (subject?.length ?? 0) > 200)
      throw new ConvexError('Keep each match under 200 characters')
    if (!rule.route && !rule.label && !rule.status && !rule.markRead)
      throw new ConvexError('Choose at least one action')
    if (rule.mailboxId && (await ctx.db.get('mailboxes', rule.mailboxId))?.userId !== ctx.userId) {
      throw new ConvexError('Mailbox not found')
    }
    const { page } = await ctx.db
      .query('filters')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate({ numItems: MAX_FILTERS, cursor: null })
    if (page.length >= MAX_FILTERS) throw new ConvexError(`You can have up to ${MAX_FILTERS} filters`)
    await ctx.db.insert('filters', { ...rule, name, from, subject, userId: ctx.userId, enabled: true })
  },
})

const setEnabled = userMutation({
  args: { filterId: v.id('filters'), enabled: v.boolean() },
  handler: async (ctx, { filterId, enabled }) => {
    await getOwned(ctx, filterId)
    await ctx.db.patch('filters', filterId, { enabled })
  },
})

const remove = userMutation({
  args: { filterId: v.id('filters') },
  handler: async (ctx, { filterId }) => {
    await getOwned(ctx, filterId)
    await ctx.db.delete('filters', filterId)
  },
})

export const manageApi = { list, create, setEnabled, remove }

// Enabled filters for one mailbox, in creation order (the first match wins).
export const forTriage = internalQuery({
  args: { userId: v.id('users'), mailboxId: v.id('mailboxes') },
  returns: v.array(schema.doc('filters')),
  handler: async (ctx, { userId, mailboxId }) => {
    const { page } = await ctx.db
      .query('filters')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: MAX_FILTERS, cursor: null })
    return page.filter((f) => f.enabled && (!f.mailboxId || f.mailboxId === mailboxId))
  },
})
