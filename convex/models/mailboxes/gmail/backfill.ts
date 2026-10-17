import { v } from 'convex/values'
import { defineBatchWorkerValidators, ping } from '@convex-dev/batch-worker'
import { components, internal } from '../../../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../../../_generated/server'
import { accessToken, gmailFetch } from '../../../lib/gmail'
import { errorKind, wideEvent } from '../../../lib/log'
import { track } from '../../../lib/pipeline'
import schema from '../../../schema'
import { ingestGmailMessage } from '../utils'
import type { Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'

const BATCH_SIZE = 10
const PAGE_SIZE = 500
const MAX_ATTEMPTS = 3
// One batch per second keeps us far below Gmail's per-user quota.
const BATCH_GAP_MS = 1000

const vEntry = v.object({
  mailboxId: v.id('mailboxes'),
  gmailId: v.string(),
  attempts: v.number(),
  runId: v.optional(v.id('backfillRuns')),
})
type Entry = Infer<typeof vEntry>

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  batch: { items: v.array(v.object({ id: v.id('backfillQueue'), ...vEntry.fields })) },
})

export const WORKER = 'gmail-backfill'

// One worker per run, so pausing a run never stops anyone else's. Emails queued outside a run share WORKER.
// batch-worker can't delete a worker, so each finished run leaves one small idle worker row behind.
export const workerName = (runId?: Id<'backfillRuns'>) => (runId ? `${WORKER}:${runId}` : WORKER)
const runOf = (name: string) => (name === WORKER ? undefined : (name.slice(WORKER.length + 1) as Id<'backfillRuns'>))

export const pingWorker = async (ctx: MutationCtx, runId?: Id<'backfillRuns'>) => {
  // Ping creates a missing worker as running, so a retry re-queued during a pause must not ping.
  if (runId && (await ctx.db.get('backfillRuns', runId))?.paused) return
  await ping(ctx, components.batchWorker, {
    name: workerName(runId),
    workQuery: internal.models.mailboxes.gmail.backfill.getBatch,
    workerMutation: internal.models.mailboxes.gmail.backfill.claimBatch,
  })
}

// Items of one batch can belong to different runs (or none); count each run separately.
const byRun = (items: Array<{ runId?: Id<'backfillRuns'> }>) => {
  const runs = new Map<Id<'backfillRuns'>, number>()
  for (const { runId } of items) if (runId) runs.set(runId, (runs.get(runId) ?? 0) + 1)
  return runs
}

// Pages through Gmail's ids and queues them. Without a limit it runs until the range is exhausted,
// continuing in a fresh action every few pages so a big mailbox never hits the action time limit.
const PAGES_PER_ACTION = 20

const LIST_ATTEMPTS = 3

export const start = internalAction({
  args: {
    mailboxId: v.id('mailboxes'),
    query: v.string(),
    limit: v.optional(v.number()),
    runId: v.optional(v.id('backfillRuns')),
    pageToken: v.optional(v.string()),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { mailboxId, query, runId } = args
    let limit = args.limit
    let pageToken = args.pageToken
    const park = (reason: 'paused' | 'failed', error?: string) =>
      runId
        ? ctx.runMutation(internal.models.mailboxes.gmail.backfill.park, {
            runId,
            listing: { mailboxId, query, limit, pageToken, reason, error },
          })
        : null
    try {
      const token = await accessToken(ctx, mailboxId)
      for (let pages = 0; pages < PAGES_PER_ACTION; pages++) {
        if (runId && (await ctx.runQuery(internal.models.mailboxes.gmail.backfill.isPaused, { runId }))) {
          await park('paused')
          return null
        }
        const size = Math.min(PAGE_SIZE, limit ?? PAGE_SIZE)
        const params = new URLSearchParams({ q: query, maxResults: String(size) })
        if (pageToken) params.set('pageToken', pageToken)
        const page = (await gmailFetch(token, `/messages?${params}`)) as {
          messages?: Array<{ id: string }>
          nextPageToken?: string
        }
        const items = (page.messages ?? []).map((m) => ({ mailboxId, gmailId: m.id, attempts: 0, runId }))
        if (items.length) await ctx.runMutation(internal.models.mailboxes.gmail.backfill.enqueue, { items })
        if (limit !== undefined) limit -= items.length
        pageToken = page.nextPageToken
        if (!pageToken || (limit !== undefined && limit <= 0)) return null
      }
      await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.backfill.start, {
        ...args,
        limit,
        pageToken,
        attempt: 0,
      })
    } catch (e) {
      // Quota and token errors are often brief: try the same page again, then park it for Retry.
      const attempt = (args.attempt ?? 0) + 1
      if (attempt < LIST_ATTEMPTS) {
        await ctx.scheduler.runAfter(attempt * 60_000, internal.models.mailboxes.gmail.backfill.start, {
          ...args,
          limit,
          pageToken,
          attempt,
        })
      } else {
        await park('failed', errorKind(e))
      }
    }
    return null
  },
})

export const isPaused = internalQuery({
  args: { runId: v.id('backfillRuns') },
  returns: v.boolean(),
  handler: async (ctx, { runId }) => (await ctx.db.get('backfillRuns', runId))?.paused === true,
})

// Remembers where a listing stopped so Resume or Retry can continue it with the same args.
export const park = internalMutation({
  args: { runId: v.id('backfillRuns'), listing: schema.tables.backfillRuns.validator.fields.pending.element },
  returns: v.null(),
  handler: async (ctx, { runId, listing }) => {
    const run = await ctx.db.get('backfillRuns', runId)
    if (!run) return null
    await ctx.db.patch('backfillRuns', runId, { pending: [...(run.pending ?? []), listing] })
    if (listing.reason === 'failed') await track(ctx, runId, 'failed', { ref: `listing ${listing.error}`, count: 0 })
    return null
  },
})

export const enqueue = internalMutation({
  args: { items: v.array(vEntry) },
  returns: v.null(),
  handler: async (ctx, { items }) => {
    for (const item of items) await ctx.db.insert('backfillQueue', { ...item, queuedAt: ctx.db.vars.commitTs })
    const retrying = items.some((i) => i.attempts > 0)
    for (const [runId, count] of byRun(items)) await track(ctx, runId, retrying ? 'retry' : 'queued', { count })
    for (const runId of new Set(items.map((i) => i.runId))) await pingWorker(ctx, runId)
    return null
  },
})

export const getBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { name, cursor }) => {
    const rows = await ctx.db
      .query('backfillQueue')
      .withIndex('by_runId_and_queuedAt', (q) => q.eq('runId', runOf(name)).gte('queuedAt', cursor ?? 0n))
      .take(BATCH_SIZE)
    if (rows.length === 0) return { kind: 'idle' as const }
    return {
      kind: 'work' as const,
      batch: {
        items: rows.map((r) => ({
          id: r._id,
          mailboxId: r.mailboxId,
          gmailId: r.gmailId,
          attempts: r.attempts,
          runId: r.runId,
        })),
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
    for (const [runId, count] of byRun(items)) await track(ctx, runId, 'claimed', { count })
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
    const log = wideEvent({ job: 'backfill.batch', size: items.length, runs: [...byRun(items).keys()] })
    const retry: Array<Entry> = []
    const skipped: Array<Entry> = []
    const failed: Array<Entry> = []
    const errors: Record<string, number> = {}
    let fetched = 0
    const later = (item: Entry, e: unknown) => {
      errors[errorKind(e)] = (errors[errorKind(e)] ?? 0) + 1
      return item.attempts + 1 < MAX_ATTEMPTS ? retry.push({ ...item, attempts: item.attempts + 1 }) : failed.push(item)
    }

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
        for (const item of mine) {
          if (existing.has(item.gmailId)) {
            skipped.push(item)
            continue
          }
          try {
            await ingestGmailMessage(ctx, token, mailboxId, item.gmailId, item.runId)
            fetched++
          } catch (e) {
            later(item, e)
          }
        }
      } catch (e) {
        mine.forEach((item) => later(item, e))
      }
    }
    if (retry.length) await ctx.runMutation(internal.models.mailboxes.gmail.backfill.enqueue, { items: retry })
    if (skipped.length || failed.length) {
      await ctx.runMutation(internal.models.mailboxes.gmail.backfill.report, { skipped, failed })
    }
    log.set({ fetched, skipped: skipped.length, retried: retry.length, failed: failed.length, errors })
    log.emit()
    return null
  },
})

export const report = internalMutation({
  args: { skipped: v.array(vEntry), failed: v.array(vEntry) },
  returns: v.null(),
  handler: async (ctx, { skipped, failed }) => {
    for (const [runId, count] of byRun(skipped)) await track(ctx, runId, 'skipped', { count })
    for (const [runId, count] of byRun(failed)) await track(ctx, runId, 'failed', { count })
    for (const { runId, mailboxId, gmailId } of failed) {
      if (runId) await ctx.db.insert('backfillFailures', { runId, mailboxId, gmailId })
    }
    return null
  },
})
