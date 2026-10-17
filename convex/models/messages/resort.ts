import { v } from 'convex/values'
import { defineBatchWorkerValidators, ping } from '@convex-dev/batch-worker'
import { components, internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import { userMutation, userQuery } from '../../lib/functions'
import { startTriage } from './utils'

const BATCH_SIZE = 5
// One email a second stays well inside Gmail's per-user, per-minute quota while the user keeps working.
const BATCH_GAP_MS = 5000
const PREFIX = 'jev-resort:'

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  batch: { ids: v.array(v.id('messages')) },
  cursor: v.string(),
})

// Sends every email (newest first) back through Jev, e.g. after the goals change.
const resortAll = userMutation({
  args: {},
  handler: async (ctx) => {
    const name = workerName(ctx.userId)
    try {
      // Start from the newest email again; throws when this user's worker doesn't exist yet.
      await ctx.runMutation(components.batchWorker.lib.setCursor, { name })
    } catch {
      // First run: ping creates the worker with no cursor.
    }
    await ping(ctx, components.batchWorker, {
      name,
      workQuery: internal.models.messages.resort.getBatch,
      workerMutation: internal.models.messages.resort.startBatch,
    })
  },
})

const workerName = (userId: string) => `${PREFIX}${userId}`

const resortStatus = userQuery({
  args: {},
  handler: async (ctx) => await ctx.runQuery(components.batchWorker.lib.status, { name: workerName(ctx.userId) }),
})

const pauseResort = userMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(components.batchWorker.lib.stop, { name: workerName(ctx.userId) })
  },
})

const resumeResort = userMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(components.batchWorker.lib.start, { name: workerName(ctx.userId) })
  },
})

// Runs triage again, with the same message, for every email Jev gave up on.
const retryFailedTriage = userMutation({
  args: {},
  handler: async (ctx) => {
    const { page } = await ctx.db
      .query('messages')
      .withIndex('by_userId_and_route_and_receivedAt', (q) => q.eq('userId', ctx.userId).eq('route', 'action'))
      .order('desc')
      .paginate({ numItems: 200, cursor: null })
    const failed = page.filter((m) => m.triageFailed)
    for (const m of failed) {
      await ctx.db.patch('messages', m._id, { userMoved: undefined })
      await startTriage(ctx, m._id)
    }
    return failed.length
  },
})

export const resortApi = { resortAll, resortStatus, pauseResort, resumeResort, retryFailedTriage }

export const getBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { name, cursor }) => {
    const userId = ctx.db.normalizeId('users', name.slice(PREFIX.length))
    if (!userId) return { kind: 'idle' as const }
    const { page, continueCursor } = await ctx.db
      .query('messages')
      .withIndex('by_userId_and_receivedAt', (q) => q.eq('userId', userId))
      .order('desc')
      .paginate({ numItems: BATCH_SIZE, cursor: cursor ?? null })
    if (page.length === 0) return { kind: 'idle' as const }
    return { kind: 'work' as const, batch: { ids: page.map((m) => m._id) }, cursor: continueCursor }
  },
})

export const startBatch = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (ctx, { ids }) => {
    for (const messageId of ids) {
      await ctx.db.patch('messages', messageId, { userMoved: undefined })
      await startTriage(ctx, messageId)
    }
    return { debounceMs: BATCH_GAP_MS }
  },
})
