import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { literals } from 'convex-helpers/validators'

export const vCategory = literals('people', 'updates', 'notifications', 'newsletters', 'promotions', 'junk')

// Only `inbox` can show in Focus.
export const vStatus = literals('inbox', 'in_progress', 'snoozed', 'done', 'cancelled', 'spam')

// Jev's decision for each email: its column on the "By Jev" board.
export const vRoute = literals('action', 'goal', 'info', 'spam')

// Where a matching filter moves an email (statuses a rule may set).
export const vFilterStatus = literals('in_progress', 'done', 'cancelled')

// Where a matching Jev workflow moves an email. `focus` = Inbox, shown in Focus.
export const vWorkflowAction = literals('focus', 'in_progress', 'done', 'cancelled', 'spam')

export default defineSchema({
  users: defineTable({ name: v.optional(v.string()), email: v.optional(v.string()), image: v.optional(v.string()) }),

  // One row per connected address. Secrets live in `mailboxSecrets` so no public
  // query can leak them by returning a mailbox doc.
  mailboxes: defineTable({
    userId: v.id('users'),
    address: v.string(),
    provider: literals('gmail', 'domain'),
    // Domain mailboxes receive through the Cloudflare Email Worker and send through one of these.
    sendVia: v.optional(literals('cloudflare', 'resend')),
    status: literals('active', 'error'),
    lastError: v.optional(v.string()),
    // Gmail incremental sync cursor and the ids of the labels we created.
    historyId: v.optional(v.string()),
    gmailLabelIds: v.optional(v.record(v.string(), v.string())),
    lastSyncedAt: v.optional(v.number()),
    // Gmail write-back after Jev sorts: add Bro/* labels, archive filed mail. Unset means on.
    autoLabel: v.optional(v.boolean()),
    autoArchive: v.optional(v.boolean()),
  })
    .index('by_userId', ['userId'])
    .index('by_address', ['address']),

  mailboxSecrets: defineTable({
    mailboxId: v.id('mailboxes'),
    refreshToken: v.string(),
    accessToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  }).index('by_mailboxId', ['mailboxId']),

  oauthStates: defineTable({ state: v.string(), userId: v.id('users'), expiresAt: v.number() }).index('by_state', [
    'state',
  ]),

  messages: defineTable({
    userId: v.id('users'),
    mailboxId: v.id('mailboxes'),
    // Gmail message id, or the RFC Message-ID for domain mail. Used to dedupe.
    externalId: v.string(),
    threadId: v.optional(v.string()),
    rfcMessageId: v.optional(v.string()),
    // Only ids, the subject and a sender name are stored; content is fetched on demand.
    fromName: v.string(),
    subject: v.string(),
    receivedAt: v.number(),
    // Domain mail has no mailbox to fetch from, so its raw email is kept AES-GCM encrypted.
    raw: v.optional(v.object({ fileId: v.id('_storage'), iv: v.string() })),
    // Set when the email arrived through a backfill run, so sorting counts toward that run.
    backfillRunId: v.optional(v.id('backfillRuns')),
    read: v.boolean(),
    status: vStatus,
    snoozedUntil: v.optional(v.number()),
    // Set by Jev. Undefined route = Jev hasn't read it yet. `focus` = needs you; only true while status is `inbox`.
    // Legacy triage from before routes; cleared when an email is re-sorted.
    triage: v.optional(v.any()),
    route: v.optional(vRoute),
    goalId: v.optional(v.id('goals')),
    // Jev gave up on this email after every retry; it waits in Needs action for a person.
    triageFailed: v.optional(v.boolean()),
    category: v.optional(vCategory),
    focus: v.optional(v.boolean()),
    // Raw Jev probabilities, kept so thresholds can change without asking Jev again.
    jev: v.optional(
      v.object({
        model: v.string(),
        routeProbabilities: v.record(v.string(), v.number()),
        // 0 = can wait, 1 = this week, 2 = today.
        urgency: v.number(),
        categoryConfidence: v.number(),
        workflowId: v.optional(v.id('jevWorkflows')),
        filterId: v.optional(v.id('filters')),
        sortedAt: v.number(),
      }),
    ),
  })
    .index('by_mailboxId_and_externalId', ['mailboxId', 'externalId'])
    .index('by_userId_and_receivedAt', ['userId', 'receivedAt'])
    .index('by_userId_and_focus_and_receivedAt', ['userId', 'focus', 'receivedAt'])
    .index('by_userId_and_status_and_receivedAt', ['userId', 'status', 'receivedAt'])
    .index('by_userId_and_route_and_receivedAt', ['userId', 'route', 'receivedAt'])
    .index('by_userId_and_category_and_receivedAt', ['userId', 'category', 'receivedAt']),

  // Gmail ids waiting to be fetched by the backfill batch worker.
  backfillQueue: defineTable({
    mailboxId: v.id('mailboxes'),
    gmailId: v.string(),
    attempts: v.number(),
    runId: v.optional(v.id('backfillRuns')),
    queuedAt: v.commitTs(),
  }).index('by_queuedAt', ['queuedAt']),

  // User-defined rules: when Jev decides `condition` holds for a new email, apply `action`.
  jevWorkflows: defineTable({
    userId: v.id('users'),
    name: v.string(),
    condition: v.string(),
    action: vWorkflowAction,
    mailboxId: v.optional(v.id('mailboxes')),
    enabled: v.boolean(),
  }).index('by_userId', ['userId']),

  // What the user is working towards; Jev routes related mail to the Goal column.
  goals: defineTable({
    userId: v.id('users'),
    title: v.string(),
    details: v.optional(v.string()),
    active: v.boolean(),
  }).index('by_userId', ['userId']),

  // A user-started backfill; its counters (sharded) and event log are keyed by this id.
  backfillRuns: defineTable({
    userId: v.id('users'),
    mailboxIds: v.array(v.id('mailboxes')),
    days: v.number(),
    startedAt: v.number(),
    paused: v.optional(v.boolean()),
    // Listings that stopped early, with the exact args to continue them (Resume or Retry).
    pending: v.optional(
      v.array(
        v.object({
          mailboxId: v.id('mailboxes'),
          query: v.string(),
          limit: v.optional(v.number()),
          pageToken: v.optional(v.string()),
          reason: literals('paused', 'failed'),
          error: v.optional(v.string()),
        }),
      ),
    ),
  }).index('by_userId', ['userId']),

  // Emails a backfill gave up on after every attempt; Retry puts them back in the queue.
  backfillFailures: defineTable({
    runId: v.id('backfillRuns'),
    mailboxId: v.id('mailboxes'),
    gmailId: v.string(),
  }).index('by_runId', ['runId']),

  // The live log for the backfill tab. Hashed email refs, steps and decisions only; never content.
  pipelineEvents: defineTable({
    runId: v.id('backfillRuns'),
    kind: literals('started', 'queued', 'claimed', 'skipped', 'fetched', 'sorted', 'retry', 'failed'),
    ref: v.optional(v.string()),
    count: v.optional(v.number()),
    route: v.optional(vRoute),
    label: v.optional(vCategory),
    at: v.number(),
  }).index('by_runId_and_at', ['runId', 'at']),

  // Gmail-style rules: exact matches on sender and subject, checked before Jev. `|` separates alternatives.
  filters: defineTable({
    userId: v.id('users'),
    name: v.string(),
    enabled: v.boolean(),
    mailboxId: v.optional(v.id('mailboxes')),
    from: v.optional(v.string()),
    subject: v.optional(v.string()),
    route: v.optional(vRoute),
    label: v.optional(vCategory),
    status: v.optional(vFilterStatus),
    markRead: v.optional(v.boolean()),
  }).index('by_userId', ['userId']),
})
