import { ShardedCounter } from '@convex-dev/sharded-counter'
import { components } from '../_generated/api'
import { env } from '../_generated/server'
import type { Infer } from 'convex/values'
import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import type { vCategory, vRoute } from '../schema'

// One shard per key keeps the live status query to one read per counter; raise it if writes start to conflict.
export const counters = new ShardedCounter(components.shardedCounter, { defaultShards: 1 })

// `parked` has no log event: it's how many fetched emails are waiting for Resume.
export const COUNTS = ['queued', 'claimed', 'skipped', 'fetched', 'sorted', 'retry', 'failed', 'parked'] as const
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
