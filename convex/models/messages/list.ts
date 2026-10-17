import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { literals } from 'convex-helpers/validators'
import { internalQuery } from '../../_generated/server'
import { userQuery } from '../../lib/functions'
import schema, { vCategory, vRoute, vStatus } from '../../schema'
import { getOwned } from './utils'
import type { Infer } from 'convex/values'

const vView = v.union(literals('focus', 'all'), vStatus, vCategory)
const STATUSES = new Set<string>(vStatus.members.map((m) => m.value))
const isStatus = (view: string): view is Infer<typeof vStatus> => STATUSES.has(view)

const list = userQuery({
  args: {
    view: vView,
    // Omitted = all inboxes.
    mailboxId: v.optional(v.id('mailboxes')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { view, mailboxId, paginationOpts }) => {
    const { userId } = ctx
    if (mailboxId) {
      const mailbox = await ctx.db.get('mailboxes', mailboxId)
      if (mailbox?.userId !== userId) throw new ConvexError('Mailbox not found')
    }
    const db = ctx.db.query('messages')
    const byView =
      view === 'all'
        ? db.withIndex('by_userId_and_receivedAt', (q) => q.eq('userId', userId))
        : view === 'focus'
          ? db.withIndex('by_userId_and_focus_and_receivedAt', (q) => q.eq('userId', userId).eq('focus', true))
          : isStatus(view)
            ? db.withIndex('by_userId_and_status_and_receivedAt', (q) => q.eq('userId', userId).eq('status', view))
            : db.withIndex('by_userId_and_category_and_receivedAt', (q) => q.eq('userId', userId).eq('category', view))
    const ordered = byView.order('desc')
    // shortcut: one inbox is a filter over the user's index (short pages are fine at personal scale); add per-mailbox indexes if it gets slow.
    // eslint-disable-next-line @convex-dev/no-filter-in-query
    const rows = mailboxId ? ordered.filter((q) => q.eq(q.field('mailboxId'), mailboxId)) : ordered
    return await rows.paginate(paginationOpts)
  },
})

// A "By Jev" column. `reading` = Jev hasn't decided yet. Handled mail (done, snoozed…) leaves the board.
const byRoute = userQuery({
  args: {
    route: v.union(vRoute, literals('reading')),
    mailboxId: v.optional(v.id('mailboxes')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { route, mailboxId, paginationOpts }) => {
    const rows = ctx.db
      .query('messages')
      .withIndex('by_userId_and_route_and_receivedAt', (q) =>
        q.eq('userId', ctx.userId).eq('route', route === 'reading' ? undefined : route),
      )
      .order('desc')
    return await rows
      // eslint-disable-next-line @convex-dev/no-filter-in-query -- shortcut: status/inbox filter over the route index; fine at personal scale.
      .filter((q) =>
        q.and(
          route === 'spam' ? true : q.or(q.eq(q.field('status'), 'inbox'), q.eq(q.field('status'), 'in_progress')),
          mailboxId ? q.eq(q.field('mailboxId'), mailboxId) : true,
        ),
      )
      .paginate(paginationOpts)
  },
})

const get = userQuery({
  args: { messageId: v.id('messages') },
  handler: async (ctx, { messageId }) => {
    const message = await getOwned(ctx, messageId)
    const mailbox = await ctx.db.get('mailboxes', message.mailboxId)
    return { ...message, mailboxAddress: mailbox?.address ?? '' }
  },
})

export const listApi = { list, byRoute, get }

export const getInternal = internalQuery({
  args: { messageId: v.id('messages') },
  returns: v.union(schema.doc('messages'), v.null()),
  handler: (ctx, { messageId }) => ctx.db.get('messages', messageId),
})
