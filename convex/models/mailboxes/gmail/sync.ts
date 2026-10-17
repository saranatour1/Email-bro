import { v } from 'convex/values'
import { internal } from '../../../_generated/api'
import { internalAction, internalMutation } from '../../../_generated/server'
import { userMutation } from '../../../lib/functions'
import { API, accessToken, gmailFetch } from '../../../lib/gmail'
import { ingestGmailMessage } from '../utils'
import schema from '../../../schema'

const BACKFILL = { query: 'in:inbox newer_than:30d', limit: 2000 }
const MAX_PER_SYNC = 100

// Called when the app opens; there is no background polling.
const syncNow = userMutation({
  args: {},
  handler: async (ctx) => {
    const { page } = await ctx.db
      .query('mailboxes')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate({ numItems: 50, cursor: null })
    const stale = Date.now() - 60_000
    for (const m of page) {
      if (m.provider !== 'gmail' || m.status !== 'active' || (m.lastSyncedAt ?? 0) > stale) continue
      await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.sync.sync, { mailboxId: m._id })
    }
  },
})

export const syncApi = { syncNow }

export const sync = internalAction({
  args: { mailboxId: v.id('mailboxes') },
  returns: v.null(),
  handler: async (ctx, { mailboxId }): Promise<null> => {
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId })
    if (!mailbox || mailbox.provider !== 'gmail') return null
    try {
      const token = await accessToken(ctx, mailboxId)
      const history =
        mailbox.lastSyncedAt !== undefined && mailbox.historyId ? await historySince(token, mailbox.historyId) : null
      if (!history) {
        // First sync, or the history cursor expired: restart history from now and backfill in the background.
        const { historyId } = (await gmailFetch(token, '/profile')) as { historyId: string }
        await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.backfill.start, { mailboxId, ...BACKFILL })
        await ctx.runMutation(internal.models.mailboxes.gmail.sync.patch, {
          mailboxId,
          fields: { historyId, lastSyncedAt: Date.now(), status: 'active' },
        })
        return null
      }
      const existing = new Set(
        await ctx.runQuery(internal.models.messages.ingest.existingExternalIds, {
          mailboxId,
          externalIds: history.ids,
        }),
      )
      for (const id of history.ids.filter((i) => !existing.has(i))) await ingestGmailMessage(ctx, token, mailboxId, id)
      await ctx.runMutation(internal.models.mailboxes.gmail.sync.patch, {
        mailboxId,
        fields: { historyId: history.historyId, lastSyncedAt: Date.now(), status: 'active' },
      })
    } catch (e) {
      await ctx.runMutation(internal.models.mailboxes.gmail.sync.patch, {
        mailboxId,
        fields: { status: 'error', lastError: e instanceof Error ? e.message : String(e) },
      })
    }
    return null
  },
})

// Null when Gmail no longer has history that far back (404).
const historySince = async (token: string, startHistoryId: string) => {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: 'messageAdded',
    labelId: 'INBOX',
    maxResults: String(MAX_PER_SYNC),
  })
  const res = await fetch(`${API}/history?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Gmail history ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as {
    historyId: string
    history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>
  }
  const ids = (body.history ?? []).flatMap((h) => (h.messagesAdded ?? []).map((m) => m.message.id))
  return { ids: [...new Set(ids)], historyId: body.historyId }
}

export const patch = internalMutation({
  args: {
    mailboxId: v.id('mailboxes'),
    fields: schema.tables.mailboxes.validator
      .pick('status', 'lastError', 'historyId', 'gmailLabelIds', 'lastSyncedAt')
      .partial(),
  },
  returns: v.null(),
  handler: async (ctx, { mailboxId, fields }) => {
    // Undefined can't cross the function boundary, so "active" is what clears a stale error.
    const clear = fields.status === 'active' ? { lastError: undefined } : {}
    await ctx.db.patch('mailboxes', mailboxId, { ...clear, ...fields })
    return null
  },
})
