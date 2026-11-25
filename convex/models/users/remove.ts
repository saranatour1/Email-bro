import { v } from 'convex/values'
import { defineBatchWorkerValidators, ping } from '@convex-dev/batch-worker'
import { sendEmail } from '@sarant/cloudflare-email-component'
import { literals } from 'convex-helpers/validators'
import { components, internal } from '../../_generated/api'
import { env, internalAction, internalMutation, internalQuery } from '../../_generated/server'
import { seal } from '../../lib/crypto'
import { userMutation } from '../../lib/functions'
import { wideEvent } from '../../lib/log'
import { resetCounters } from '../../lib/pipeline'
import { workerName } from '../mailboxes/gmail/backfill'
import type { Infer } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

// One worker erases every deleted account, oldest first.
const WORKER = 'account-deletion'
const BATCH_SIZE = 100

// Every table that holds a user's rows.
const vTable = literals(
  'mailboxSecrets',
  'mailboxes',
  'cloudflareAccounts',
  'labels',
  'filters',
  'jevWorkflows',
  'goals',
  'messages',
  'pipelineEvents',
  'backfillFailures',
  'backfillQueue',
  'backfillRuns',
)
type Table = Infer<typeof vTable>

const { vQueryArgs, vQueryReturns, vMutationArgs, vMutationReturns } = defineBatchWorkerValidators({
  // Up to BATCH_SIZE rows of one table. No table means only the user row and their sign-in records are left.
  batch: {
    userId: v.id('users'),
    table: v.optional(vTable),
    ids: v.array(v.string()),
    files: v.array(v.id('_storage')),
  },
  // The account being erased and how far through its mail, so each scan starts past what's already gone.
  cursor: v.object({ deletedAt: v.commitTs(), receivedAt: v.optional(v.number()) }),
})

// Ends every session and unlinks the Google sign-in, so signing in again starts a new, empty account.
const signOutEverywhere = async (ctx: MutationCtx, userId: Id<'users'>) => {
  const sessions = await ctx.runQuery(components.auth.public.listSessions, { userId })
  await ctx.runMutation(components.auth.public.revokeSessions, { sessionIds: sessions.map((s) => s.sessionId) })
  await ctx.runMutation(components.authGoogle.provider.deleteUser, { userId })
}

// Hides the account at once; its data is erased in the background, and the user gets an email when it's gone.
const deleteAccount = userMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.patch('users', ctx.userId, { deletedAt: ctx.db.vars.commitTs })
    await signOutEverywhere(ctx, ctx.userId)
    await ctx.scheduler.runAfter(0, internal.models.users.remove.start, { userId: ctx.userId })
  },
})

export const removeApi = { deleteAccount }

// Pauses the user's backfills so no more mail is fetched or sorted, then wakes the deletion worker.
export const start = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const { page: runs } = await ctx.db
      .query('backfillRuns')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: 100, cursor: null })
    for (const run of runs) {
      await ctx.db.patch('backfillRuns', run._id, { paused: true })
      await ctx.runMutation(components.batchWorker.lib.stop, { name: workerName(run._id) })
    }
    await ping(ctx, components.batchWorker, {
      name: WORKER,
      workQuery: internal.models.users.remove.getBatch,
      workerMutation: internal.models.users.remove.eraseBatch,
    })
    return null
  },
})

type Rows = { table: Table; ids: Array<string>; files?: Array<Id<'_storage'>>; receivedAt?: number }
const rowsOf = (table: Table, docs: Array<{ _id: string }>): Rows => ({ table, ids: docs.map((d) => d._id) })

// The user's next rows to erase, one table at a time; null once only the user row is left.
const nextRows = async (ctx: QueryCtx, userId: Id<'users'>, after?: number): Promise<Rows | null> => {
  // Mailboxes and their tokens first, so no more mail arrives while the rest goes.
  const mailboxes = await ctx.db
    .query('mailboxes')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(BATCH_SIZE)
  for (const mailbox of mailboxes) {
    const secrets = await ctx.db
      .query('mailboxSecrets')
      .withIndex('by_mailboxId', (q) => q.eq('mailboxId', mailbox._id))
      .take(BATCH_SIZE)
    if (secrets.length) return rowsOf('mailboxSecrets', secrets)
  }
  if (mailboxes.length) return rowsOf('mailboxes', mailboxes)

  for (const table of ['cloudflareAccounts', 'labels', 'filters', 'jevWorkflows', 'goals'] as const) {
    const docs = await ctx.db
      .query(table)
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(BATCH_SIZE)
    if (docs.length) return rowsOf(table, docs)
  }

  const messages = await ctx.db
    .query('messages')
    .withIndex('by_userId_and_receivedAt', (q) =>
      after === undefined ? q.eq('userId', userId) : q.eq('userId', userId).gte('receivedAt', after),
    )
    .take(BATCH_SIZE)
  if (messages.length) {
    return {
      ...rowsOf('messages', messages),
      // Domain mail's encrypted raw email.
      files: messages.flatMap((m) => (m.raw ? [m.raw.fileId] : [])),
      receivedAt: messages[messages.length - 1].receivedAt,
    }
  }

  // Backfill runs last, once anything still in flight has settled: each run's log, failures and queue, then the run.
  const run = await ctx.db
    .query('backfillRuns')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()
  if (!run) return null
  const events = await ctx.db
    .query('pipelineEvents')
    .withIndex('by_runId_and_at', (q) => q.eq('runId', run._id))
    .take(BATCH_SIZE)
  if (events.length) return rowsOf('pipelineEvents', events)
  const failures = await ctx.db
    .query('backfillFailures')
    .withIndex('by_runId', (q) => q.eq('runId', run._id))
    .take(BATCH_SIZE)
  if (failures.length) return rowsOf('backfillFailures', failures)
  const queued = await ctx.db
    .query('backfillQueue')
    .withIndex('by_runId_and_queuedAt', (q) => q.eq('runId', run._id))
    .take(BATCH_SIZE)
  if (queued.length) return rowsOf('backfillQueue', queued)
  return rowsOf('backfillRuns', [run])
}

export const getBatch = internalQuery({
  args: vQueryArgs,
  returns: vQueryReturns,
  handler: async (ctx, { cursor }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_deletedAt', (q) => q.gte('deletedAt', cursor?.deletedAt ?? 0n))
      .first()
    if (user?.deletedAt === undefined) return { kind: 'idle' as const }
    // The next account starts from its oldest mail.
    const after = cursor?.deletedAt === user.deletedAt ? cursor.receivedAt : undefined
    const rows = await nextRows(ctx, user._id, after)
    return {
      kind: 'work' as const,
      batch: { userId: user._id, table: rows?.table, ids: rows?.ids ?? [], files: rows?.files ?? [] },
      cursor: { deletedAt: user.deletedAt, receivedAt: rows?.receivedAt ?? after },
    }
  },
})

export const eraseBatch = internalMutation({
  args: vMutationArgs,
  returns: vMutationReturns,
  handler: async (ctx, { userId, table, ids, files }) => {
    if (table) {
      for (const raw of ids) {
        // It may be gone since the scan: a claimed queue row, expired Cloudflare credentials.
        const id = ctx.db.normalizeId(table, raw)
        if (!id || !(await ctx.db.get(table, id))) continue
        // A run's counters live in the sharded-counter component.
        const runId = table === 'backfillRuns' ? ctx.db.normalizeId(table, raw) : null
        if (runId) await resetCounters(ctx, runId)
        await ctx.db.delete(table, id)
      }
      for (const fileId of files) {
        if (await ctx.db.system.get('_storage', fileId)) await ctx.storage.delete(fileId)
      }
      return null
    }

    const user = await ctx.db.get('users', userId)
    if (!user) return null
    // Sealed copies of mail they sent through Cloudflare, 500 a call; the loop comes back while more remain.
    if (await ctx.runMutation(components.cloudflareEmail.lib.removeOwner, { owner: userId })) return null
    // Again, in case a sign-in raced the first one.
    await signOutEverywhere(ctx, userId)
    await ctx.db.delete('users', userId)
    if (user.email) {
      await ctx.scheduler.runAfter(0, internal.models.users.remove.sendGoodbye, { email: user.email, name: user.name })
    }
    return null
  },
})

const goodbye = (name?: string) => `Hi${name ? ` ${name.split(' ')[0]}` : ''},

Thanks for using Email Bro. Your account and all the data we kept for it are now officially deleted: your connected mailboxes and their access, sorted mail, labels, filters, workflows, goals and backfill history.

Nothing was deleted from your Gmail or your own domain. To remove Email Bro's access to Gmail as well, open Security in your Google Account.

If you come back, signing in starts a new, empty account.

Email Bro`

// The component's copies of notices are kept under this owner, never under a user.
const NOTICES = 'account-notices'

// Sent from Email Bro's own domain through Cloudflare. The address is only in this job's args; the user row is gone.
export const sendGoodbye = internalAction({
  args: { email: v.string(), name: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { email, name }) => {
    const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken, NOTICE_FROM: from } = env
    if (!accountId || !apiToken || !from) {
      wideEvent({ job: 'account.goodbye', sent: false }).emit()
      return null
    }
    const result = await sendEmail(ctx, components.cloudflareEmail, {
      owner: NOTICES,
      accountId,
      apiToken,
      email: { from, to: email, subject: 'Your Email Bro data has been deleted', text: goodbye(name) },
      seal: (text) => seal(NOTICES, 'mail-copy', text),
    })
    // The copy holds their address, the last thing we had of theirs.
    await ctx.runMutation(components.cloudflareEmail.lib.remove, { owner: NOTICES, emailId: result.emailId })
    const { errorCode, httpStatus } = result
    wideEvent({ job: 'account.goodbye', sent: !result.error, errorCode, httpStatus }).emit()
    if (result.error) throw new Error(`Cloudflare didn't send the goodbye email (${httpStatus ?? errorCode})`)
    return null
  },
})
