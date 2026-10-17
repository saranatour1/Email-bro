import { ConvexError, v } from 'convex/values'
import { literals } from 'convex-helpers/validators'
import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { userMutation } from '../../lib/functions'
import { getOwned } from './utils'
import type { vStatus } from '../../schema'
import type { MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import type { Infer } from 'convex/values'

const markRead = userMutation({
  args: { messageId: v.id('messages') },
  handler: async (ctx, { messageId }) => {
    const message = await getOwned(ctx, messageId)
    if (!message.read) await ctx.db.patch('messages', messageId, { read: true })
  },
})

const setStatus = userMutation({
  args: { messageId: v.id('messages'), status: literals('inbox', 'in_progress', 'done', 'cancelled', 'spam') },
  handler: async (ctx, { messageId, status }) => {
    await getOwned(ctx, messageId)
    await moveTo(ctx, messageId, status)
  },
})

const snooze = userMutation({
  args: { messageId: v.id('messages'), until: v.number() },
  handler: async (ctx, { messageId, until }) => {
    await getOwned(ctx, messageId)
    const now = Date.now()
    if (until < now + 60_000 || until > now + 366 * 86_400_000) {
      throw new ConvexError('Pick a time between a minute and a year from now')
    }
    await moveTo(ctx, messageId, 'snoozed', { snoozedUntil: until })
    await ctx.scheduler.runAt(until, internal.models.messages.status.wake, { messageId, until })
  },
})

export const statusApi = { markRead, setStatus, snooze }

// A snooze ended: back to the top of Focus as unread. Re-snoozing makes older wake-ups no-ops.
export const wake = internalMutation({
  args: { messageId: v.id('messages'), until: v.number() },
  returns: v.null(),
  handler: async (ctx, { messageId, until }) => {
    const message = await ctx.db.get('messages', messageId)
    if (message?.status !== 'snoozed' || message.snoozedUntil !== until) return null
    await moveTo(ctx, messageId, 'inbox', { read: false })
    return null
  },
})

// Every status change goes through here so `focus` and the Gmail inbox stay in step with it.
const moveTo = async (
  ctx: MutationCtx,
  messageId: Id<'messages'>,
  status: Infer<typeof vStatus>,
  extra: Partial<Doc<'messages'>> = {},
) => {
  await ctx.db.patch('messages', messageId, {
    status,
    focus: status === 'inbox',
    snoozedUntil: undefined,
    ...(status === 'inbox' ? {} : { read: true }),
    ...extra,
  })
  await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.writeBack.syncInbox, { messageId })
}
