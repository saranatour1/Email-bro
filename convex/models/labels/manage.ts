import { ConvexError, v } from 'convex/values'
import { internal } from '../../_generated/api'
import { internalQuery } from '../../_generated/server'
import { userMutation, userQuery } from '../../lib/functions'
import { vLabelColor } from '../../schema'
import { getOwned as getOwnedMessage } from '../messages/utils'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

// Labels with a description are extra Jev questions on every email, so the set stays small.
export const MAX_LABELS = 20
// Labels on one email, so a row never turns into a wall of chips.
export const MAX_PER_MESSAGE = 10

const vFields = {
  name: v.string(),
  color: vLabelColor,
  senders: v.optional(v.string()),
  description: v.optional(v.string()),
}

const userLabels = (ctx: QueryCtx | MutationCtx, userId: Id<'users'>) =>
  ctx.db
    .query('labels')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .paginate({ numItems: MAX_LABELS, cursor: null })

// Trims and checks the fields; an empty optional field is stored as unset.
const clean = (fields: { name: string; senders?: string; description?: string }) => {
  const name = fields.name.trim()
  const senders = fields.senders?.trim() || undefined
  const description = fields.description?.trim() || undefined
  if (!name || name.length > 40) throw new ConvexError('Give the label a name (up to 40 characters)')
  if (senders && senders.length > 500) throw new ConvexError('Keep the senders under 500 characters')
  if (description && (description.length < 8 || description.length > 500)) {
    throw new ConvexError('Describe the label in 8–500 characters')
  }
  return { name, senders, description }
}

const getOwned = async (ctx: MutationCtx & { userId: Id<'users'> }, labelId: Id<'labels'>) => {
  const label = await ctx.db.get('labels', labelId)
  if (!label || label.userId !== ctx.userId) throw new ConvexError('Label not found')
  return label
}

const list = userQuery({ args: {}, handler: async (ctx) => (await userLabels(ctx, ctx.userId)).page })

const create = userMutation({
  args: vFields,
  handler: async (ctx, { color, ...fields }) => {
    const { name, senders, description } = clean(fields)
    const { page } = await userLabels(ctx, ctx.userId)
    if (page.length >= MAX_LABELS) throw new ConvexError(`You can have up to ${MAX_LABELS} labels`)
    if (page.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError('You already have a label with that name')
    }
    await ctx.db.insert('labels', { userId: ctx.userId, name, color, senders, description })
  },
})

const update = userMutation({
  args: { labelId: v.id('labels'), ...vFields },
  handler: async (ctx, { labelId, color, ...fields }) => {
    const label = await getOwned(ctx, labelId)
    const { name, senders, description } = clean(fields)
    const { page } = await userLabels(ctx, ctx.userId)
    if (page.some((l) => l._id !== labelId && l.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError('You already have a label with that name')
    }
    await ctx.db.replace('labels', labelId, { userId: ctx.userId, name, color, senders, description })
    // A renamed label gets a new Gmail label from now on; mail already labelled keeps the old one.
    if (name !== label.name) await forgetGmailLabel(ctx, labelId)
  },
})

// shortcut: emails keep the deleted id in `labelIds` and the UI skips unknown ids. Clean them up in a batch job if
// lists of deleted ids ever matter.
const remove = userMutation({
  args: { labelId: v.id('labels') },
  handler: async (ctx, { labelId }) => {
    await getOwned(ctx, labelId)
    await ctx.db.delete('labels', labelId)
    await forgetGmailLabel(ctx, labelId)
  },
})

// Adds or removes one label on one email, then mirrors the change into Gmail.
const setOnMessage = userMutation({
  args: { messageId: v.id('messages'), labelId: v.id('labels'), on: v.boolean() },
  handler: async (ctx, { messageId, labelId, on }) => {
    const message = await getOwnedMessage(ctx, messageId)
    await getOwned(ctx, labelId)
    const current = message.labelIds ?? []
    if (on === current.includes(labelId)) return
    if (on && current.length >= MAX_PER_MESSAGE)
      throw new ConvexError(`An email can have up to ${MAX_PER_MESSAGE} labels`)
    await ctx.db.patch('messages', messageId, {
      labelIds: on ? [...current, labelId] : current.filter((id) => id !== labelId),
    })
    await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.writeBack.syncLabels, {
      messageId,
      add: on ? [labelId] : [],
      remove: on ? [] : [labelId],
    })
  },
})

export const manageApi = { list, create, update, remove, setOnMessage }

// Drops the cached Gmail label id for this label from every mailbox of its owner.
const forgetGmailLabel = async (ctx: MutationCtx & { userId: Id<'users'> }, labelId: Id<'labels'>) => {
  const { page: mailboxes } = await ctx.db
    .query('mailboxes')
    .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
    .paginate({ numItems: 50, cursor: null })
  for (const mailbox of mailboxes) {
    if (!mailbox.gmailLabelIds?.[labelId]) continue
    const { [labelId]: _forgotten, ...rest } = mailbox.gmailLabelIds
    await ctx.db.patch('mailboxes', mailbox._id, { gmailLabelIds: rest })
  }
}

export const forTriage = internalQuery({
  args: { userId: v.id('users') },
  returns: v.array(
    v.object({ _id: v.id('labels'), senders: v.optional(v.string()), description: v.optional(v.string()) }),
  ),
  handler: async (ctx, { userId }) =>
    (await userLabels(ctx, userId)).page.map(({ _id, senders, description }) => ({ _id, senders, description })),
})

// Names for Gmail write-back; ids of deleted labels are left out.
export const names = internalQuery({
  args: { labelIds: v.array(v.id('labels')) },
  returns: v.array(v.object({ _id: v.id('labels'), name: v.string() })),
  handler: async (ctx, { labelIds }) => {
    const labels = await Promise.all(labelIds.slice(0, MAX_PER_MESSAGE).map((id) => ctx.db.get('labels', id)))
    return labels.flatMap((l) => (l ? [{ _id: l._id, name: l.name }] : []))
  },
})
