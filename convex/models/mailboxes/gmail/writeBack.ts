import { v } from 'convex/values'
import { internal } from '../../../_generated/api'
import { internalAction } from '../../../_generated/server'
import { accessToken, gmailFetch } from '../../../lib/gmail'
import type { ActionCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

// Categories whose non-actionable mail leaves the Gmail inbox after triage.
const ARCHIVE_IF_NOT_FOCUS = new Set(['notifications', 'newsletters', 'promotions', 'junk'])

// Mirror triage into Gmail: the user's own labels under their own names, and archive the noise.
export const applyTriage = internalAction({
  args: { messageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message?.category) return null
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId })
    if (mailbox?.provider !== 'gmail') return null
    const labels =
      mailbox.autoLabel !== false
        ? await ctx.runQuery(internal.models.labels.manage.names, { labelIds: message.labelIds ?? [] })
        : []
    // Also archives what a workflow moved to Done, Cancelled or Spam.
    const keep =
      message.status === 'in_progress' ||
      (message.status === 'inbox' && (message.focus === true || !ARCHIVE_IF_NOT_FOCUS.has(message.category)))
    const archive = mailbox.autoArchive !== false && !keep
    if (!labels.length && !archive) return null
    const token = await accessToken(ctx, mailbox._id)
    await gmailFetch(token, `/messages/${message.externalId}/modify`, {
      addLabelIds: await Promise.all(labels.map((l) => ensureLabel(ctx, token, mailbox, l))),
      removeLabelIds: archive ? ['INBOX'] : [],
    })
    return null
  },
})

// After a label is added or removed by hand.
export const syncLabels = internalAction({
  args: { messageId: v.id('messages'), add: v.array(v.id('labels')), remove: v.array(v.id('labels')) },
  returns: v.null(),
  handler: async (ctx, { messageId, add, remove }) => {
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message) return null
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId })
    if (mailbox?.provider !== 'gmail' || mailbox.autoLabel === false) return null
    const toAdd = await ctx.runQuery(internal.models.labels.manage.names, { labelIds: add })
    // Only labels Email Bro created in this mailbox can be taken off.
    const toRemove = remove.flatMap((id) => mailbox.gmailLabelIds?.[id] ?? [])
    if (!toAdd.length && !toRemove.length) return null
    const token = await accessToken(ctx, mailbox._id)
    await gmailFetch(token, `/messages/${message.externalId}/modify`, {
      addLabelIds: await Promise.all(toAdd.map((l) => ensureLabel(ctx, token, mailbox, l))),
      removeLabelIds: toRemove,
    })
    return null
  },
})

// After a status change: Inbox and In progress stay in the Gmail inbox; everything else is archived.
// Reads the current status, so out-of-order runs still converge on the latest state.
export const syncInbox = internalAction({
  args: { messageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message) return null
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId })
    if (mailbox?.provider !== 'gmail') return null
    const token = await accessToken(ctx, mailbox._id)
    const inInbox = message.status === 'in_progress' || (message.status === 'inbox' && message.focus === true)
    // With "archive in gmail" off, Email Bro never takes mail out of the Gmail inbox.
    if (!inInbox && mailbox.autoArchive === false) return null
    await gmailFetch(
      token,
      `/messages/${message.externalId}/modify`,
      inInbox ? { addLabelIds: ['INBOX'] } : { removeLabelIds: ['INBOX'] },
    )
    return null
  },
})

// The Gmail label id for one of the user's labels, created under the label's own name the first time.
const ensureLabel = async (
  ctx: ActionCtx,
  token: string,
  mailbox: Doc<'mailboxes'>,
  label: { _id: Id<'labels'>; name: string },
): Promise<string> => {
  const known = mailbox.gmailLabelIds?.[label._id]
  if (known) return known
  const { labels = [] } = (await gmailFetch(token, '/labels')) as { labels?: Array<{ id: string; name: string }> }
  const id =
    labels.find((l) => l.name === label.name)?.id ??
    ((await gmailFetch(token, '/labels', { name: label.name })) as { id: string }).id
  await ctx.runMutation(internal.models.mailboxes.gmail.sync.patch, {
    mailboxId: mailbox._id,
    fields: { gmailLabelIds: { [label._id]: id } },
  })
  return id
}
