import { v } from 'convex/values'
import { internal } from '../../../_generated/api'
import { internalAction, internalMutation } from '../../../_generated/server'
import { userMutation } from '../../../lib/functions'
import { API, accessToken, gmailFetch } from '../../../lib/gmail'
import {
  CONNECT_BACKFILL,
  historyCursor,
  isGoneGmailMessage,
  mergeLabelIds,
  shouldSyncMailbox,
} from '../../../lib/gmailSync'
import { ingestGmailMessage } from '../utils'
import schema from '../../../schema'
import type { GmailHistoryPage } from '../../../lib/gmailSync'

const MAX_PER_SYNC = 100
const MAX_HISTORY_PAGES = 20
const NEXT_PAGE_MS = 1000

const syncNow = userMutation({
  args: {},
  handler: async (ctx) => {
    const { page } = await ctx.db
      .query('mailboxes')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate({ numItems: 50, cursor: null })
    const now = Date.now()
    for (const m of page) {
      if (!shouldSyncMailbox(m, now)) continue
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
        await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.backfill.start, {
          mailboxId,
          ...CONNECT_BACKFILL,
        })
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
      for (const id of history.ids.filter((i) => !existing.has(i))) {
        try {
          await ingestGmailMessage(ctx, token, mailboxId, id)
        } catch (e) {
          if (!isGoneGmailMessage(e)) throw e
        }
      }
      await ctx.runMutation(internal.models.mailboxes.gmail.sync.patch, {
        mailboxId,
        fields: {
          ...(history.historyId ? { historyId: history.historyId } : {}),
          lastSyncedAt: Date.now(),
          status: 'active',
        },
      })
      if (history.hasMore) {
        await ctx.scheduler.runAfter(NEXT_PAGE_MS, internal.models.mailboxes.gmail.sync.sync, { mailboxId })
      }
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
  const pages: Array<GmailHistoryPage> = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      labelId: 'INBOX',
      maxResults: String(MAX_PER_SYNC),
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`${API}/history?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Gmail history ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as GmailHistoryPage
    pages.push(body)
    const folded = historyCursor(startHistoryId, pages)
    if (!body.nextPageToken || folded.historyId) return folded
    pageToken = body.nextPageToken
  }
  return historyCursor(startHistoryId, pages)
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
    const gmailLabelIds = fields.gmailLabelIds
      ? mergeLabelIds((await ctx.db.get('mailboxes', mailboxId))?.gmailLabelIds, fields.gmailLabelIds)
      : undefined
    await ctx.db.patch('mailboxes', mailboxId, { ...clear, ...fields, ...(gmailLabelIds ? { gmailLabelIds } : {}) })
    return null
  },
})
