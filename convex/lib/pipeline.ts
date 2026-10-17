import { ShardedCounter } from '@convex-dev/sharded-counter'
import { components } from '../_generated/api'
import { env } from '../_generated/server'
import type { Infer } from 'convex/values'
import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import type { vCategory, vRoute } from '../schema'

// Up to 25 triage steps bump the same totals at once; 8 shards keep those writes from conflicting.
// Only ever raise this: counts already stored in higher shards would be dropped by a lower number.
export const counters = new ShardedCounter(components.shardedCounter, { defaultShards: 8 })

export const COUNTS = ['queued', 'claimed', 'skipped', 'fetched', 'sorted', 'retry', 'failed'] as const
export type Count = (typeof COUNTS)[number]
export const counterKey = (runId: Id<'backfillRuns'>, name: string) => `${runId}:${name}`

// A short keyed hash of an email id: stable per email, meaningless without ID_HASH_KEY.
export const emailRef = async (externalId: string) => {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.ID_HASH_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(externalId)))
  return [...sig.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Event = Omit<Doc<'pipelineEvents'>, '_id' | '_creationTime' | 'runId' | 'at' | 'kind'>

// Records one step: bumps the run's counters and appends to its live log.
export const track = async (
  ctx: MutationCtx,
  runId: Id<'backfillRuns'>,
  kind: Doc<'pipelineEvents'>['kind'],
  event: Event & { route?: Infer<typeof vRoute>; label?: Infer<typeof vCategory> } = {},
) => {
  // The run may have been cleared by a newer one while its emails were still in flight.
  if (!(await ctx.db.get('backfillRuns', runId))) return
  const n = event.count ?? 1
  if (kind !== 'started') await counters.add(ctx, counterKey(runId, kind), n)
  if (event.route) await counters.add(ctx, counterKey(runId, `route:${event.route}`), n)
  if (event.label) await counters.add(ctx, counterKey(runId, `label:${event.label}`), n)
  await ctx.db.insert('pipelineEvents', { runId, kind, ...event, at: Date.now() })
}
