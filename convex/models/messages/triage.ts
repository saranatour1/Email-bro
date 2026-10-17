import { v } from 'convex/values'
import { defineWorkflow } from '@convex-dev/workflow'
import { experimental_decide as decide } from 'ai'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { components, internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { toCleanMarkdown } from '../../lib/markdown'
import { vCategory, vRoute, vWorkflowAction } from '../../schema'
import { loadMail } from './utils'
import type { Infer } from 'convex/values'
import type { Id } from '../../_generated/dataModel'

// "Jev latest" on the Convex AI Gateway; the alias moves with each stable Jev release.
const JEV = '~typesafe/jev-latest'

// The board columns Jev chooses between. `goal` is only offered when the user has active goals.
const ROUTES: Record<Infer<typeof vRoute>, string> = {
  action:
    'The recipient personally has to do something: reply, pay, sign, confirm, decide, attend, or respond to a security alert.',
  goal: 'It moves forward one of the goals in `goals`: news, a reply, or a next step for one of them.',
  info: 'Nothing is required of the recipient: receipts, confirmations, notifications, newsletters, updates, FYI.',
  spam: 'Unwanted: scams, phishing, cold sales outreach, or bulk mail the recipient never asked for.',
}

const URGENCY = ['Can wait, or there is no deadline', 'Should be handled in the next few days', 'Needs attention today']

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
const NO_GOAL = 'none'

const vJudgment = v.object({
  route: vRoute,
  routeProbabilities: v.record(v.string(), v.number()),
  goalId: v.optional(v.id('goals')),
  urgency: v.number(),
  category: vCategory,
  categoryConfidence: v.number(),
  matched: v.union(v.null(), v.object({ workflowId: v.id('jevWorkflows'), action: vWorkflowAction })),
})
type Judgment = Infer<typeof vJudgment>

// Durable per-message pipeline: each step retries on its own and completed steps never re-run.
export const triageMessage = defineWorkflow(components.workflow, {
  args: { messageId: v.id('messages') },
  workpoolOptions: {
    retryActionsByDefault: true,
    // Gmail's quota resets per minute, so back off 10s, 20s, 40s, 80s before giving up.
    defaultRetryBehavior: { maxAttempts: 5, initialBackoffMs: 10_000, base: 2 },
  },
}).handler(async (step, { messageId }): Promise<void> => {
  const judgment = await step.runAction(internal.models.messages.triage.classify, { messageId })
  if (!judgment) return
  const { route, goalId, category, matched, ...signals } = judgment
  // Policy lives here, on top of raw probabilities, so it can change without asking Jev again.
  const focus = matched ? matched.action === 'focus' : route === 'action' || route === 'goal'
  await step.runMutation(internal.models.messages.triage.saveTriage, {
    messageId,
    route,
    goalId,
    category,
    focus,
    action: matched?.action,
    jev: { model: JEV, ...signals, workflowId: matched?.workflowId },
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
    const [mailbox, mail, goals, workflows] = await Promise.all([
      ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId }),
      loadMail(ctx, message),
      ctx.runQuery(internal.models.goals.manage.forTriage, { userId: message.userId }),
      ctx.runQuery(internal.models.jevWorkflows.manage.forTriage, {
        userId: message.userId,
        mailboxId: message.mailboxId,
      }),
    ])
    const routes = goals.length ? ROUTES : { action: ROUTES.action, info: ROUTES.info, spam: ROUTES.spam }
    // Asked in the same call, keyed by workflow id.
    const custom = Object.fromEntries(
      workflows.map((w) => [
        w._id,
        { type: 'boolean' as const, instructions: `\`recipient\` received \`email\`. ${w.condition}` },
      ]),
    )

    // convexGateway mints the deployment-scoped token itself; no provider keys.
    const { answers } = await decide({
      model: convexGateway.evaluationModel(JEV),
      state: {
        recipient: mailbox?.address,
        goals: goals.map((g) => (g.details ? `${g.title}: ${g.details}` : g.title)),
        email: { from: `${mail.fromName} <${mail.from}>`, subject: mail.subject, body: toCleanMarkdown(mail) },
      },
      questions: {
        route: { type: 'choice', instructions: 'Where does `email` belong for `recipient`?', criteria: routes },
        urgency: {
          type: 'score',
          instructions: 'How soon does `recipient` need to deal with `email`?',
          criteria: URGENCY,
        },
        category: { type: 'choice', instructions: 'Which kind of email is `email`?', criteria: CATEGORIES },
        // Speculative: only read when the route is `goal`.
        ...(goals.length
          ? {
              goal: {
                type: 'choice' as const,
                instructions: 'Which goal in `goals` does `email` move forward?',
                criteria: {
                  ...Object.fromEntries(goals.map((g) => [g._id, g.details ? `${g.title}: ${g.details}` : g.title])),
                  [NO_GOAL]: 'None of these goals',
                },
              },
            }
          : {}),
        ...custom,
      },
    })

    // Guard the model's choices before storing them.
    // `goal` is only offered when goals exist, so widen to every route before validating.
    const route = answers.route.choice as Infer<typeof vRoute>
    const category = answers.category.choice
    if (!(route in ROUTES) || !(category in CATEGORIES)) {
      throw new Error(`Unexpected Jev answer: ${route} / ${category}`)
    }
    const goalAnswer = answers.goal
    const goalChoice: string | undefined = goalAnswer?.type === 'choice' ? goalAnswer.choice : undefined
    return {
      route,
      routeProbabilities: answers.route.probabilities ?? { [route]: 1 },
      goalId: route === 'goal' ? goals.find((g) => g._id === goalChoice)?._id : undefined,
      urgency: answers.urgency.score,
      category,
      // The SDK returns the distribution, not a confidence score: keep the winner's share.
      categoryConfidence: answers.category.probabilities?.[category] ?? 0,
      matched: matchWorkflow(workflows, answers),
    }
  },
})

const matchWorkflow = (
  workflows: Array<{ _id: Id<'jevWorkflows'>; action: Infer<typeof vWorkflowAction> }>,
  answers: Partial<Record<string, { type: string; probability?: number }>>,
) => {
  const hit = workflows.find((w) => (answers[w._id]?.probability ?? 0) >= MATCH_THRESHOLD)
  return hit ? { workflowId: hit._id, action: hit.action } : null
}

export const saveTriage = internalMutation({
  args: {
    messageId: v.id('messages'),
    route: vRoute,
    goalId: v.optional(v.id('goals')),
    category: vCategory,
    focus: v.boolean(),
    action: v.optional(vWorkflowAction),
    jev: v.object({
      model: v.string(),
      routeProbabilities: v.record(v.string(), v.number()),
      urgency: v.number(),
      categoryConfidence: v.number(),
      workflowId: v.optional(v.id('jevWorkflows')),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, action, focus, jev, ...fields }) => {
    const message = await ctx.db.get('messages', messageId)
    if (!message) return null
    const decided = { ...fields, jev: { ...jev, sortedAt: Date.now() }, triage: undefined }
    // The user already moved it before Jev finished: keep their status, just record the decision.
    if (message.status !== 'inbox') {
      await ctx.db.patch('messages', messageId, decided)
      return null
    }
    const spam = !action && fields.route === 'spam'
    await ctx.db.patch('messages', messageId, {
      ...decided,
      status: action ? (action === 'focus' ? 'inbox' : action) : spam ? 'spam' : 'inbox',
      focus: focus && !spam,
    })
    return null
  },
})
