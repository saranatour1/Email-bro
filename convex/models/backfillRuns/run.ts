import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { generateText } from 'ai'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { components, internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import { userAction, userMutation, userQuery } from '../../lib/functions'
import { COUNTS, counterKey, counters, track } from '../../lib/pipeline'
import { vCategory, vRoute } from '../../schema'
import { WORKER, pingWorker } from '../mailboxes/gmail/backfill'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

const STUDY_MODEL = 'anthropic/claude-haiku-5.5'
const ROUTE_KEYS = vRoute.members.map((m) => m.value)
const LABEL_KEYS = vCategory.members.map((m) => m.value)

// User-started: queues every inbox email in the range for each Gmail mailbox and runs until done.
const startRun = userMutation({
  args: { mailboxId: v.optional(v.id('mailboxes')), days: v.optional(v.number()) },
  handler: async (ctx, { mailboxId, days }) => {
    const { page } = await ctx.db
      .query('mailboxes')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate({ numItems: 50, cursor: null })
    const mailboxes = page.filter(
      (m) => m.provider === 'gmail' && m.status === 'active' && (!mailboxId || m._id === mailboxId),
    )
    if (mailboxes.length === 0) throw new ConvexError('Connect a Gmail account first')
    // Starting clears the previous run, so never start over one that is still moving.
    const worker = await ctx.runQuery(components.batchWorker.lib.status, { name: WORKER })
    if (worker?.kind === 'running')
      throw new ConvexError('A backfill is still running. Pause it or wait for it to finish.')
    if (worker?.kind === 'stopped') await ctx.runMutation(components.batchWorker.lib.start, { name: WORKER })

    // Convex allows one .paginate() per function, so this second, fixed read uses .take().
    const previous = await ctx.db
      .query('backfillRuns')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .take(10)
    for (const run of previous)
      await ctx.scheduler.runAfter(0, internal.models.backfillRuns.run.clear, { runId: run._id })

    const runId = await ctx.db.insert('backfillRuns', {
      userId: ctx.userId,
      mailboxIds: mailboxes.map((m) => m._id),
      days: days ?? 0,
      startedAt: Date.now(),
    })
    await track(ctx, runId, 'started', { count: mailboxes.length })
    const query = days ? `in:inbox newer_than:${days}d` : 'in:inbox'
    for (const m of mailboxes) {
      await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.backfill.start, {
        mailboxId: m._id,
        query,
        runId,
      })
    }
    return runId
  },
})

const readStatus = async (ctx: QueryCtx, run: Doc<'backfillRuns'>) => {
  const count = (name: string) => counters.count(ctx, counterKey(run._id, name))
  const entries = async (names: Array<string>, prefix = '') =>
    Object.fromEntries(await Promise.all(names.map(async (n) => [n, await count(`${prefix}${n}`)] as const)))
  return {
    run,
    counts: await entries([...COUNTS]),
    routes: await entries(ROUTE_KEYS, 'route:'),
    labels: await entries(LABEL_KEYS, 'label:'),
    worker: await ctx.runQuery(components.batchWorker.lib.status, { name: WORKER }),
  }
}

const latestRun = (ctx: QueryCtx, userId: Id<'users'>) =>
  ctx.db
    .query('backfillRuns')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .order('desc')
    .first()

const status = userQuery({
  args: {},
  handler: async (ctx) => {
    const run = await latestRun(ctx, ctx.userId)
    return run ? await readStatus(ctx, run) : null
  },
})

const events = userQuery({
  args: { runId: v.id('backfillRuns'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { runId, paginationOpts }) => {
    const run = await ctx.db.get('backfillRuns', runId)
    if (run?.userId !== ctx.userId) throw new ConvexError('Run not found')
    return await ctx.db
      .query('pipelineEvents')
      .withIndex('by_runId_and_at', (q) => q.eq('runId', runId))
      .order('desc')
      .paginate(paginationOpts)
  },
})

// Haiku reviews the run's numbers and event timeline (no email content) and suggests improvements.
const study = userAction({
  args: { runId: v.id('backfillRuns') },
  handler: async (ctx, { runId }): Promise<string> => {
    const data = await ctx.runQuery(internal.models.backfillRuns.run.forStudy, { runId, userId: ctx.userId })
    if (!data) throw new ConvexError('Run not found')
    const { text } = await generateText({
      model: convexGateway(STUDY_MODEL),
      maxOutputTokens: 600,
      system:
        'You review an email-sorting pipeline: Gmail ids are queued, a batch worker claims 10 at a time, emails are fetched, then Jev (a decision model) routes each one to Needs action, Goal, Info or Spam and labels it. You get counters and a timeline, never email content. In under 200 words of Markdown: how fast it ran and where it slowed, what the routing mix says, any failures and their likely cause, and 2–3 concrete tuning or workflow suggestions.',
      prompt: JSON.stringify(data),
    })
    return text
  },
})

const getOwnedRun = async (ctx: MutationCtx & { userId: Id<'users'> }, runId: Id<'backfillRuns'>) => {
  const run = await ctx.db.get('backfillRuns', runId)
  if (run?.userId !== ctx.userId) throw new ConvexError('Run not found')
  return run
}

// Pause stops the batch worker taking new batches; in-flight listings park themselves at the next page.
const pauseRun = userMutation({
  args: { runId: v.id('backfillRuns') },
  handler: async (ctx, { runId }) => {
    await getOwnedRun(ctx, runId)
    await ctx.db.patch('backfillRuns', runId, { paused: true })
    await ctx.runMutation(components.batchWorker.lib.stop, { name: WORKER })
  },
})

const resumeRun = userMutation({
  args: { runId: v.id('backfillRuns') },
  handler: async (ctx, { runId }) => {
    const run = await getOwnedRun(ctx, runId)
    const paused = (run.pending ?? []).filter((p) => p.reason === 'paused')
    await ctx.db.patch('backfillRuns', runId, {
      paused: false,
      pending: (run.pending ?? []).filter((p) => p.reason !== 'paused'),
    })
    await ctx.runMutation(components.batchWorker.lib.start, { name: WORKER })
    for (const { mailboxId, query, limit, pageToken } of paused) {
      await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.backfill.start, {
        mailboxId,
        query,
        limit,
        pageToken,
        runId,
      })
    }
  },
})

// Retries what failed with the same args: failed listings from their page, failed emails back into the queue.
const retryRun = userMutation({
  args: { runId: v.id('backfillRuns') },
  handler: async (ctx, { runId }) => {
    const run = await getOwnedRun(ctx, runId)
    const failedListings = (run.pending ?? []).filter((p) => p.reason === 'failed')
    await ctx.db.patch('backfillRuns', runId, { pending: (run.pending ?? []).filter((p) => p.reason !== 'failed') })
    for (const { mailboxId, query, limit, pageToken } of failedListings) {
      await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.backfill.start, {
        mailboxId,
        query,
        limit,
        pageToken,
        runId,
      })
    }
    const { page } = await ctx.db
      .query('backfillFailures')
      .withIndex('by_runId', (q) => q.eq('runId', runId))
      .paginate({ numItems: 500, cursor: null })
    if (page.length === 0) return
    for (const f of page) {
      await ctx.db.delete('backfillFailures', f._id)
      await ctx.db.insert('backfillQueue', {
        mailboxId: f.mailboxId,
        gmailId: f.gmailId,
        attempts: 0,
        runId,
        queuedAt: ctx.db.vars.commitTs,
      })
    }
    // They're no longer failures; the retry shows in the log and counters.
    await counters.subtract(ctx, counterKey(runId, 'failed'), page.length)
    await track(ctx, runId, 'retry', { count: page.length })
    await pingWorker(ctx)
  },
})

export const runApi = { startRun, status, events, study, pauseRun, resumeRun, retryRun }

export const forStudy = internalQuery({
  args: { runId: v.id('backfillRuns'), userId: v.id('users') },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, { runId, userId }) => {
    const run = await ctx.db.get('backfillRuns', runId)
    if (run?.userId !== userId) return null
    const { counts, routes, labels, worker } = await readStatus(ctx, run)
    const { page } = await ctx.db
      .query('pipelineEvents')
      .withIndex('by_runId_and_at', (q) => q.eq('runId', runId))
      .order('desc')
      .paginate({ numItems: 400, cursor: null })
    // Ten-second buckets of how many emails each step handled.
    const timeline: Record<string, Record<string, number>> = {}
    for (const e of page) {
      const bucket = `${Math.floor((e.at - run.startedAt) / 10_000) * 10}s`
      timeline[bucket] ??= {}
      timeline[bucket][e.kind] = (timeline[bucket][e.kind] ?? 0) + (e.count ?? 1)
    }
    return {
      days: run.days || 'all',
      elapsedSeconds: Math.round((Date.now() - run.startedAt) / 1000),
      counts,
      routes,
      labels,
      worker,
      timeline,
    }
  },
})

// Removes an old run's log and counters, a page at a time.
export const clear = internalMutation({
  args: { runId: v.id('backfillRuns') },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const { page, isDone } = await ctx.db
      .query('pipelineEvents')
      .withIndex('by_runId_and_at', (q) => q.eq('runId', runId))
      .paginate({ numItems: 500, cursor: null })
    for (const e of page) await ctx.db.delete('pipelineEvents', e._id)
    // A second paginated query isn't allowed in one function, so take a fixed page.
    const failures = await ctx.db
      .query('backfillFailures')
      .withIndex('by_runId', (q) => q.eq('runId', runId))
      .take(500)
    for (const f of failures) await ctx.db.delete('backfillFailures', f._id)
    if (!isDone || failures.length === 500) {
      await ctx.scheduler.runAfter(0, internal.models.backfillRuns.run.clear, { runId })
      return null
    }
    for (const name of [...COUNTS, ...ROUTE_KEYS.map((r) => `route:${r}`), ...LABEL_KEYS.map((l) => `label:${l}`)]) {
      await counters.reset(ctx, counterKey(runId, name))
    }
    await ctx.db.delete('backfillRuns', runId)
    return null
  },
})
