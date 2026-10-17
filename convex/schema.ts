import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { literals } from 'convex-helpers/validators'

export const vCategory = literals('people', 'updates', 'notifications', 'newsletters', 'promotions', 'junk')

// Only `inbox` can show in Focus.
export const vStatus = literals('inbox', 'in_progress', 'snoozed', 'done', 'cancelled', 'spam')

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
    read: v.boolean(),
    status: vStatus,
    snoozedUntil: v.optional(v.number()),
    // Set by triage. `focus` = shows in the default view; only ever true while status is `inbox`.
    category: v.optional(vCategory),
    focus: v.optional(v.boolean()),
    triage: v.optional(
      v.object({
        model: v.string(),
        categoryConfidence: v.number(),
        // Raw Jev probabilities, kept so thresholds can change without re-running inference.
        needsAction: v.number(),
        fromRealPerson: v.number(),
        workflowId: v.optional(v.id('jevWorkflows')),
      }),
    ),
  })
    .index('by_mailboxId_and_externalId', ['mailboxId', 'externalId'])
    .index('by_userId_and_receivedAt', ['userId', 'receivedAt'])
    .index('by_userId_and_focus_and_receivedAt', ['userId', 'focus', 'receivedAt'])
    .index('by_userId_and_status_and_receivedAt', ['userId', 'status', 'receivedAt'])
    .index('by_userId_and_category_and_receivedAt', ['userId', 'category', 'receivedAt']),

  // Gmail ids waiting to be fetched by the backfill batch worker.
  backfillQueue: defineTable({
    mailboxId: v.id('mailboxes'),
    gmailId: v.string(),
    attempts: v.number(),
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
})
