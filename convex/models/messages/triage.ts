import { v } from 'convex/values'
import { defineWorkflow } from '@convex-dev/workflow'
import { experimental_decide as decide } from 'ai'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { components, internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import schema, { vCategory, vWorkflowAction } from '../../schema'
import { loadMail } from './utils'
import type { Infer } from 'convex/values'
import type { Id } from '../../_generated/dataModel'

// "Jev latest" on the Convex AI Gateway; the alias moves with each stable Jev release.
const JEV = '~typesafe/jev-latest'

const CATEGORIES: Record<Infer<typeof vCategory>, string> = {
  people:
    'Written personally by a human to the recipient: friends, family, colleagues, clients, or anyone in a real back-and-forth conversation.',
  updates:
    "Transactional messages about the recipient's own accounts or activity: receipts, orders, shipping, bills, bookings, account or security notices.",
  notifications:
    'Automated alerts from apps and services: social media, GitHub, Slack, calendar, comments, mentions, reminders.',
  newsletters: 'Editorial content the recipient subscribed to: newsletters, digests, blog posts, changelogs.',
  promotions: 'Marketing meant to sell: sales, discounts, offers, product launches, event promos.',
  junk: 'Unwanted mail: cold sales outreach, scams, phishing, or obvious spam.',
}

// A user workflow applies when Jev is at least this sure its condition holds.
const MATCH_THRESHOLD = 0.7

const vJudgment = v.object({
  category: vCategory,
  categoryConfidence: v.number(),
  needsAction: v.number(),
  fromRealPerson: v.number(),
  matched: v.union(v.null(), v.object({ workflowId: v.id('jevWorkflows'), action: vWorkflowAction })),
})
type Judgment = Infer<typeof vJudgment>

// Durable per-message pipeline: each step retries on its own and completed steps never re-run.
export const triageMessage = defineWorkflow(components.workflow, {
  args: { messageId: v.id('messages') },
  workpoolOptions: {
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 2000, base: 2 },
  },
}).handler(async (step, { messageId }): Promise<void> => {
  const judgment = await step.runAction(internal.models.messages.triage.classify, { messageId })
  if (!judgment) return
  const { category, matched, ...signals } = judgment
  // Policy lives here, on top of raw probabilities, so it can change without re-asking Jev.
  const focus = matched
    ? matched.action === 'focus'
    : category !== 'junk' && (signals.needsAction >= 0.5 || (category === 'people' && signals.fromRealPerson >= 0.5))
  await step.runMutation(internal.models.messages.triage.saveTriage, {
    messageId,
    category,
    focus,
    action: matched?.action,
    triage: { model: JEV, ...signals, workflowId: matched?.workflowId },
  })
  await step.runAction(internal.models.mailboxes.gmail.writeBack.applyTriage, { messageId })
})

export const classify = internalAction({
  args: { messageId: v.id('messages') },
  returns: v.union(vJudgment, v.null()),
  // Explicit return type: this module references itself through `internal`.
  handler: async (ctx, { messageId }): Promise<Judgment | null> => {
    const message = await ctx.runQuery(internal.models.messages.list.getInternal, { messageId })
    if (!message) return null
    const mailbox = await ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId })
    const mail = await loadMail(ctx, message)
    const workflows = await ctx.runQuery(internal.models.jevWorkflows.manage.forTriage, {
      userId: message.userId,
      mailboxId: message.mailboxId,
    })
    // Asked in the same call as triage, keyed by workflow id.
    const custom = Object.fromEntries(
      workflows.map((w) => [w._id, { type: 'boolean' as const, instructions: `\`recipient\` received \`email\`. ${w.condition}` }]),
    )
    // convexGateway mints the deployment-scoped token itself; no provider keys.
    const { answers } = await decide({
      model: convexGateway.evaluationModel(JEV),
      state: {
        recipient: mailbox?.address,
        email: {
          from: `${mail.fromName} <${mail.from}>`,
          to: mail.to,
          subject: mail.subject,
          body: mail.text.slice(0, 6000),
        },
      },
      questions: {
        category: { type: 'choice', instructions: 'Which kind of email is `email`?', criteria: CATEGORIES },
        needs_action: {
          type: 'boolean',
          instructions:
            '`recipient` received `email`. Does the recipient personally need to read or act on it soon: reply, pay, sign, confirm, decide, attend, or respond to a security issue?',
          criteria: {
            true: 'There is a specific action or decision for the recipient, or a person is waiting on them.',
            false: 'Informational, marketing, or automated with nothing required of the recipient.',
          },
        },
        from_real_person: {
          type: 'boolean',
          instructions:
            'Was `email` written personally by a real human specifically for `recipient`, rather than a template, mass mailing, or automated system?',
        },
        ...custom,
      },
    })

    // decide() types answers from the question keys; still guard the choice before storing it.
    const category = answers.category.choice
    if (!(category in CATEGORIES)) {
      throw new Error(`Unexpected Jev category: ${category}`)
    }
    return {
      category,
      // The SDK returns the distribution, not a confidence score: keep the winner's share.
      categoryConfidence: answers.category.probabilities?.[category] ?? 0,
      needsAction: answers.needs_action.probability,
      fromRealPerson: answers.from_real_person.probability,
      matched: matchWorkflow(workflows, answers),
    }
  },
})

const matchWorkflow = (
  workflows: Array<{ _id: Id<'jevWorkflows'>; action: Infer<typeof vWorkflowAction> }>,
  answers: Record<string, { type: string; probability?: number }>,
) => {
  const hit = workflows.find((w) => (answers[w._id]?.probability ?? 0) >= MATCH_THRESHOLD)
  return hit ? { workflowId: hit._id, action: hit.action } : null
}

export const saveTriage = internalMutation({
  args: {
    messageId: v.id('messages'),
    category: vCategory,
    focus: v.boolean(),
    action: v.optional(vWorkflowAction),
    triage: schema.tables.messages.validator.fields.triage,
  },
  returns: v.null(),
  handler: async (ctx, { messageId, ...fields }) => {
    const message = await ctx.db.get('messages', messageId)
    if (!message) return null
    // The user already moved it before triage finished: keep their status, just add the labels.
    if (message.status !== 'inbox') {
      await ctx.db.patch('messages', messageId, { category: fields.category, triage: fields.triage })
      return null
    }
    const { action, ...rest } = fields
    const spam = !action && fields.category === 'junk'
    await ctx.db.patch('messages', messageId, {
      ...rest,
      status: action ? (action === 'focus' ? 'inbox' : action) : spam ? 'spam' : 'inbox',
      focus: fields.focus && !spam,
    })
    return null
  },
})
