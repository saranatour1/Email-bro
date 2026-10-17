import { v } from 'convex/values'
import { internal } from '../../../_generated/api'
import { internalAction } from '../../../_generated/server'
import { accessToken, gmailFetch } from '../../../lib/gmail'
import type { ActionCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'

// Categories whose non-actionable mail leaves the Gmail inbox after triage.
const ARCHIVE_IF_NOT_FOCUS = new Set(['notifications', 'newsletters', 'promotions', 'junk'])
const labelName = (category: string) => `Bro/${category[0].toUpperCase()}${category.slice(1)}`

// Mirror triage into Gmail: a Bro/<Category> label, and archive the noise.
export const applyTriage = internalAction({
  args: { messageId: v.id('messages') },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message?.category) return null
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId })
    if (mailbox?.provider !== 'gmail') return null
    const label = mailbox.autoLabel !== false
    // Also archives what a workflow moved to Done, Cancelled or Spam.
    const keep =
      message.status === 'in_progress' ||
      (message.status === 'inbox' && (message.focus === true || !ARCHIVE_IF_NOT_FOCUS.has(message.category)))
    const archive = mailbox.autoArchive !== false && !keep
    if (!label && !archive) return null
    const token = await accessToken(ctx, mailbox._id)
    await gmailFetch(token, `/messages/${message.externalId}/modify`, {
      addLabelIds: label ? [await ensureLabel(ctx, token, mailbox, message.category)] : [],
      removeLabelIds: archive ? ['INBOX'] : [],
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

const ensureLabel = async (
  ctx: ActionCtx,
  token: string,
  mailbox: Doc<'mailboxes'>,
  category: string,
): Promise<string> => {
  const known = mailbox.gmailLabelIds?.[category]
  if (known) return known
  const name = labelName(category)
  const { labels = [] } = (await gmailFetch(token, '/labels')) as { labels?: Array<{ id: string; name: string }> }
  const id =
    labels.find((l) => l.name === name)?.id ?? ((await gmailFetch(token, '/labels', { name })) as { id: string }).id
  await ctx.runMutation(internal.models.mailboxes.gmail.sync.patch, {
    mailboxId: mailbox._id,
    fields: { gmailLabelIds: { [category]: id } },
  })
  return id
}
