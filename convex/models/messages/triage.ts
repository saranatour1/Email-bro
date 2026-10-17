import { v } from 'convex/values'
import { defineWorkflow, vResultValidator, vWorkflowId } from '@convex-dev/workflow'
import { experimental_decide as decide } from 'ai'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { components, internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { matchFilter } from '../../lib/filters'
import { toCleanMarkdown } from '../../lib/markdown'
import { errorKind, wideEvent } from '../../lib/log'
import { counterKey, counters, emailRef, track } from '../../lib/pipeline'
import { vCategory, vFilterStatus, vRoute, vWorkflowAction } from '../../schema'
import { loadMail } from './utils'
import type { ActionCtx } from '../../_generated/server'
import type { Infer } from 'convex/values'
import type { Doc, Id } from '../../_generated/dataModel'

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
  filter: v.union(
    v.null(),
    v.object({ filterId: v.id('filters'), status: v.optional(vFilterStatus), markRead: v.optional(v.boolean()) }),
  ),
  // `filter` when a filter decided route and label on its own and Jev wasn't asked.
  model: v.string(),
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
  const { route, goalId, category, matched, filter, ...signals } = judgment
  // Policy lives here, on top of raw probabilities, so it can change without asking Jev again.
  // A filter's status beats a Jev workflow's action; both beat the route's default.
  const action = filter?.status ?? matched?.action
  const focus = action ? action === 'focus' : route === 'action' || route === 'goal'
  await step.runMutation(internal.models.messages.triage.saveTriage, {
    messageId,
    route,
    goalId,
    category,
    focus,
    action,
    markRead: filter?.markRead,
    jev: { ...signals, workflowId: matched?.workflowId, filterId: filter?.filterId },
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
    const runId = message.backfillRunId
    if (runId && (await ctx.runQuery(internal.models.mailboxes.gmail.backfill.isPaused, { runId }))) {
      await ctx.runMutation(internal.models.messages.triage.parkTriage, { messageId, runId })
      return null
    }
    const log = wideEvent({ job: 'triage.classify', messageId, source: message.raw ? 'domain' : 'gmail', model: JEV })
    try {
      const judgment = await judge(ctx, message)
      log.set({
        route: judgment.route,
        routeConfidence: judgment.routeProbabilities[judgment.route],
        urgency: judgment.urgency,
        category: judgment.category,
        goalMatched: !!judgment.goalId,
        workflowMatched: !!judgment.matched,
        filterMatched: !!judgment.filter,
        jevSkipped: judgment.model === 'filter',
      })
      log.emit()
      return judgment
    } catch (e) {
      // The workflow retries this step; the event records why it failed.
      log.set({ failed: true, error: errorKind(e) })
      log.emit()
      throw e
    }
  },
})

const judge = async (ctx: ActionCtx, message: Doc<'messages'>): Promise<Judgment> => {
  const [mailbox, mail, goals, workflows, filters] = await Promise.all([
    ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId }),
    loadMail(ctx, message),
    ctx.runQuery(internal.models.goals.manage.forTriage, { userId: message.userId }),
    ctx.runQuery(internal.models.jevWorkflows.manage.forTriage, {
      userId: message.userId,
      mailboxId: message.mailboxId,
    }),
    ctx.runQuery(internal.models.filters.manage.forTriage, { userId: message.userId, mailboxId: message.mailboxId }),
  ])
  const hit = matchFilter(filters, mail)
  const filter = hit ? { filterId: hit._id, status: hit.status, markRead: hit.markRead } : null
  // A filter that sets both the column and the label decides on its own: no Jev call.
  if (hit?.route && hit.label) {
    return {
      route: hit.route,
      routeProbabilities: { [hit.route]: 1 },
      urgency: 0,
      category: hit.label,
      categoryConfidence: 1,
      matched: null,
      filter,
      model: 'filter',
    }
  }
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
  // A filter that sets only one of route or label overrides just that part of Jev's answer.
  const finalRoute = hit?.route ?? route
  return {
    route: finalRoute,
    routeProbabilities: hit?.route ? { [finalRoute]: 1 } : (answers.route.probabilities ?? { [route]: 1 }),
    goalId: finalRoute === 'goal' ? goals.find((g) => g._id === goalChoice)?._id : undefined,
    urgency: answers.urgency.score,
    category: hit?.label ?? category,
    // The SDK returns the distribution, not a confidence score: keep the winner's share.
    categoryConfidence: hit?.label ? 1 : (answers.category.probabilities?.[category] ?? 0),
    matched: matchWorkflow(workflows, answers),
    filter,
    model: JEV,
  }
}

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
    markRead: v.optional(v.boolean()),
    jev: v.object({
      model: v.string(),
      routeProbabilities: v.record(v.string(), v.number()),
      urgency: v.number(),
      categoryConfidence: v.number(),
      workflowId: v.optional(v.id('jevWorkflows')),
      filterId: v.optional(v.id('filters')),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, action, focus, markRead, jev, ...fields }) => {
    const message = await ctx.db.get('messages', messageId)
    if (!message) return null
    const decided = {
      ...fields,
      jev: { ...jev, sortedAt: Date.now() },
      triage: undefined,
      triageFailed: undefined,
      ...(markRead ? { read: true } : {}),
    }
    // Only an email's first decision counts toward its backfill run; re-sorts and retries don't.
    if (message.backfillRunId && !message.jev) {
      await track(ctx, message.backfillRunId, 'sorted', {
        ref: await emailRef(message.externalId),
        route: fields.route,
        label: fields.category,
      })
    }
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

// Runs when a triage workflow ends. If every retry failed, the email leaves Reading for Needs action.
export const parkTriage = internalMutation({
  args: { messageId: v.id('messages'), runId: v.id('backfillRuns') },
  returns: v.null(),
  handler: async (ctx, { messageId, runId }) => {
    // A retried step may park the same email twice; count it once.
    if ((await ctx.db.get('messages', messageId))?.triageParked) return null
    await ctx.db.patch('messages', messageId, { triageParked: true })
    await counters.add(ctx, counterKey(runId, 'parked'), 1)
    return null
  },
})

export const onTriageDone = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ messageId: v.id('messages') }) },
  returns: v.null(),
  handler: async (ctx, { result, context: { messageId } }) => {
    if (result.kind !== 'failed') return null
    const message = await ctx.db.get('messages', messageId)
    if (!message || message.route) return null
    await ctx.db.patch('messages', messageId, {
      route: 'action',
      triageFailed: true,
      focus: message.status === 'inbox',
    })
    // It still lands in a column, so it counts as sorted and the run can finish.
    if (message.backfillRunId) {
      await track(ctx, message.backfillRunId, 'sorted', { ref: await emailRef(message.externalId), route: 'action' })
    }
    return null
  },
})
