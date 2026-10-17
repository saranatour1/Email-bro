import { v } from 'convex/values'
import { defineBatchWorkerValidators, ping } from '@convex-dev/batch-worker'
import { components, internal } from '../../../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../../../_generated/server'
import { accessToken, gmailFetch } from '../../../lib/gmail'
import { ingestGmailMessage } from '../utils'
import type { Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'

const BATCH_SIZE = 10
const PAGE_SIZE = 500
const MAX_ATTEMPTS = 3
// One batch per second keeps us far below Gmail's per-user quota.
const BATCH_GAP_MS = 1000

const vEntry = v.object({ mailboxId: v.id('mailboxes'), gmailId: v.string(), attempts: v.number() })
type Entry = Infer<typeof vEntry>

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  batch: { items: v.array(v.object({ id: v.id('backfillQueue'), ...vEntry.fields })) },
})

const pingWorker = (ctx: MutationCtx) =>
  ping(ctx, components.batchWorker, {
    name: 'gmail-backfill',
    workQuery: internal.models.mailboxes.gmail.backfill.getBatch,
    workerMutation: internal.models.mailboxes.gmail.backfill.claimBatch,
  })

export const start = internalAction({
  args: { mailboxId: v.id('mailboxes'), query: v.string(), limit: v.number() },
  returns: v.null(),
  handler: async (ctx, { mailboxId, query, limit }): Promise<null> => {
    const token = await accessToken(ctx, mailboxId)
    let queued = 0
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({ q: query, maxResults: String(Math.min(PAGE_SIZE, limit - queued)) })
      if (pageToken) params.set('pageToken', pageToken)
      const page = (await gmailFetch(token, `/messages?${params}`)) as {
        messages?: Array<{ id: string }>
        nextPageToken?: string
      }
      const items = (page.messages ?? []).map((m) => ({ mailboxId, gmailId: m.id, attempts: 0 }))
      if (items.length) await ctx.runMutation(internal.models.mailboxes.gmail.backfill.enqueue, { items })
      queued += items.length
      pageToken = page.nextPageToken
    } while (pageToken && queued < limit)
    return null
  },
})

export const enqueue = internalMutation({
  args: { items: v.array(vEntry) },
  returns: v.null(),
  handler: async (ctx, { items }) => {
    for (const item of items) await ctx.db.insert('backfillQueue', { ...item, queuedAt: ctx.db.vars.commitTs })
    await pingWorker(ctx)
    return null
  },
})

export const getBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { cursor }) => {
    const rows = await ctx.db
      .query('backfillQueue')
      .withIndex('by_queuedAt', (q) => q.gte('queuedAt', cursor ?? 0n))
      .take(BATCH_SIZE)
    if (rows.length === 0) return { kind: 'idle' as const }
    return {
      kind: 'work' as const,
      batch: {
        items: rows.map((r) => ({ id: r._id, mailboxId: r.mailboxId, gmailId: r.gmailId, attempts: r.attempts })),
      },
      cursor: rows[rows.length - 1].queuedAt,
    }
  },
})

// Claims the batch by deleting it; the action re-queues anything that fails.
export const claimBatch = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (ctx, { items }) => {
    for (const { id } of items) await ctx.db.delete('backfillQueue', id)
    await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.backfill.fetchBatch, {
      items: items.map(({ id: _id, ...entry }) => entry),
    })
    return { debounceMs: BATCH_GAP_MS }
  },
})

export const fetchBatch = internalAction({
  args: { items: v.array(vEntry) },
  returns: v.null(),
  handler: async (ctx, { items }): Promise<null> => {
    const retry: Array<Entry> = []
    const later = (item: Entry) =>
      item.attempts + 1 < MAX_ATTEMPTS && retry.push({ ...item, attempts: item.attempts + 1 })

    for (const mailboxId of new Set(items.map((i) => i.mailboxId))) {
      const mine = items.filter((i) => i.mailboxId === mailboxId)
      try {
        const token = await accessToken(ctx, mailboxId)
        const existing = new Set(
          await ctx.runQuery(internal.models.messages.ingest.existingExternalIds, {
            mailboxId,
            externalIds: mine.map((i) => i.gmailId),
          }),
        )
        for (const item of mine.filter((i) => !existing.has(i.gmailId))) {
          try {
            await ingestGmailMessage(ctx, token, mailboxId, item.gmailId)
          } catch {
            later(item)
          }
        }
      } catch {
        mine.forEach(later)
      }
    }
    if (retry.length) await ctx.runMutation(internal.models.mailboxes.gmail.backfill.enqueue, { items: retry })
    return null
  },
})
