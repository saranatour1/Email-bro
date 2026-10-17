import { v } from 'convex/values'
import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import { counterKey, counters } from '../../lib/pipeline'
import { WORKER, pingWorker } from '../mailboxes/gmail/backfill'

// One-off for deployments from before per-run workers and the parked counter. Safe to run again:
// npx convex run models/backfillRuns/migrate:workers
export const workers = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // Older deploys paused by stopping the shared worker, and nothing stops it now.
    await ctx.runMutation(components.batchWorker.lib.start, { name: WORKER })
    const { page: runs } = await ctx.db.query('backfillRuns').paginate({ numItems: 100, cursor: null })
    for (const run of runs) {
      // Count emails parked before the counter existed, so Resume can subtract exactly what it restarts.
      const parked = await ctx.db
        .query('messages')
        .withIndex('by_backfillRunId_and_triageParked', (q) => q.eq('backfillRunId', run._id).eq('triageParked', true))
        .take(5000)
      const key = counterKey(run._id, 'parked')
      await counters.reset(ctx, key)
      if (parked.length) await counters.add(ctx, key, parked.length)
      // Queue rows from before per-run workers have no worker to claim them until one is pinged.
      if (!run.paused) await pingWorker(ctx, run._id)
    }
    return runs.length
  },
})
