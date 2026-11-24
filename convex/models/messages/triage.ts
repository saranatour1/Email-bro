import { v } from 'convex/values'
import { defineWorkflow, vResultValidator, vWorkflowId } from '@convex-dev/workflow'
import { experimental_decide as decide } from 'ai'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { components, internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import { hit, matchFilter } from '../../lib/filters'
import { toCleanMarkdown } from '../../lib/markdown'
import { errorKind, wideEvent } from '../../lib/log'
import { counterKey, counters, emailRef, track } from '../../lib/pipeline'
import { triagePatch } from '../../lib/triagePatch'
import { vCategory, vFilterStatus, vRoute, vWorkflowAction } from '../../schema'
import { MAX_PER_MESSAGE } from '../labels/manage'
import { loadMail, startTriage } from './utils'
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
  // The user's labels that fit: by sender, or because Jev said yes to the label's description.
  labelIds: v.array(v.id('labels')),
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
  const { route, goalId, category, labelIds, matched, filter, ...signals } = judgment
  // Policy lives here, on top of raw probabilities, so it can change without asking Jev again.
  // A filter's status beats a Jev workflow's action; both beat the route's default.
  const action = filter?.status ?? matched?.action
  const focus = action ? action === 'focus' : route === 'action' || route === 'goal'
  await step.runMutation(internal.models.messages.triage.saveTriage, {
    messageId,
    route,
    goalId,
    category,
    labelIds,
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
    const runId = firstSort(message) ? message.backfillRunId : undefined
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
  const [mailbox, mail, goals, workflows, filters, labels] = await Promise.all([
    ctx.runQuery(internal.models.mailboxes.list.get, { mailboxId: message.mailboxId }),
    loadMail(ctx, message),
    ctx.runQuery(internal.models.goals.manage.forTriage, { userId: message.userId }),
    ctx.runQuery(internal.models.jevWorkflows.manage.forTriage, {
      userId: message.userId,
      mailboxId: message.mailboxId,
    }),
    ctx.runQuery(internal.models.filters.manage.forTriage, { userId: message.userId, mailboxId: message.mailboxId }),
    ctx.runQuery(internal.models.labels.manage.forTriage, { userId: message.userId }),
  ])
  const matched = matchFilter(filters, mail)
  const filter = matched ? { filterId: matched._id, status: matched.status, markRead: matched.markRead } : null
  const bySender = labels
    .filter((l) => l.senders && hit(l.senders, `${mail.fromName} <${mail.from}>`))
    .map((l) => l._id)
  // A filter that sets both the column and the label decides on its own: no Jev call.
  if (matched?.route && matched.label) {
    return {
      route: matched.route,
      routeProbabilities: { [matched.route]: 1 },
      urgency: 0,
      category: matched.label,
      categoryConfidence: 1,
      labelIds: bySender,
      matched: null,
      filter,
      model: 'filter',
    }
  }
  const routes = goals.length ? ROUTES : { action: ROUTES.action, info: ROUTES.info, spam: ROUTES.spam }
  // Asked in the same call, keyed by workflow or label id.
  const custom = Object.fromEntries(
    workflows.map((w) => [
      w._id,
      { type: 'boolean' as const, instructions: `\`recipient\` received \`email\`. ${w.condition}` },
    ]),
  )
  // Sender matches are already in; only the rest is worth a question.
  const described = labels.filter((l) => l.description && !bySender.includes(l._id))
  const labelQuestions = Object.fromEntries(
    described.map((l) => [
      l._id,
      {
        type: 'boolean' as const,
        instructions: `\`recipient\` labels mail that fits this description: ${l.description} Does \`email\` fit it?`,
      },
    ]),
  )

  // convexGateway mints the deployment-scoped token itself; no provider keys.
  // zdr: only endpoints that keep no copy of the request, since the email body is in it.
  const { answers } = await decide({
    model: convexGateway.evaluationModel(JEV, { zdr: true }),
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
      ...labelQuestions,
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
  const finalRoute = matched?.route ?? route
  return {
    route: finalRoute,
    routeProbabilities: matched?.route ? { [finalRoute]: 1 } : (answers.route.probabilities ?? { [route]: 1 }),
    goalId: finalRoute === 'goal' ? goals.find((g) => g._id === goalChoice)?._id : undefined,
    urgency: answers.urgency.score,
    category: matched?.label ?? category,
    // The SDK returns the distribution, not a confidence score: keep the winner's share.
    categoryConfidence: matched?.label ? 1 : (answers.category.probabilities?.[category] ?? 0),
    labelIds: [...bySender, ...described.filter((l) => isYes(answers, l._id)).map((l) => l._id)],
    matched: matchWorkflow(workflows, answers),
    filter,
    model: JEV,
  }
}

const matchWorkflow = (
  workflows: Array<{ _id: Id<'jevWorkflows'>; action: Infer<typeof vWorkflowAction> }>,
  answers: Partial<Record<string, { type: string; probability?: number }>>,
) => {
  const found = workflows.find((w) => isYes(answers, w._id))
  return found ? { workflowId: found._id, action: found.action } : null
}

// A yes-or-no question keyed by id (a workflow or a label) counts when Jev is sure enough.
const isYes = (answers: Partial<Record<string, { type: string; probability?: number }>>, id: string) =>
  (answers[id]?.probability ?? 0) >= MATCH_THRESHOLD

export const saveTriage = internalMutation({
  args: {
    messageId: v.id('messages'),
    route: vRoute,
    goalId: v.optional(v.id('goals')),
    category: vCategory,
    labelIds: v.array(v.id('labels')),
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
  handler: async (ctx, { messageId, action, focus, markRead, labelIds, jev, ...fields }) => {
    const message = await ctx.db.get('messages', messageId)
    if (!message) return null
    if (message.backfillRunId && firstSort(message)) {
      await track(ctx, message.backfillRunId, 'sorted', {
        ref: await emailRef(message.externalId),
        route: fields.route,
        label: fields.category,
      })
    }
    await ctx.db.patch('messages', messageId, {
      ...triagePatch(message, { ...fields, action, focus, jev: { ...jev, sortedAt: Date.now() } }),
      ...(markRead ? { read: true } : {}),
      // Labels only add up: a re-sort never takes off one the user put on by hand.
      labelIds: [...new Set([...(message.labelIds ?? []), ...labelIds])].slice(0, MAX_PER_MESSAGE),
    })
    return null
  },
})

// An email's first sort counts toward its backfill run and waits for Resume. Re-sorts don't, and neither does
// retrying a failure: that email was counted when it fell back to Needs action.
const firstSort = (m: Doc<'messages'>) => !m.jev && !m.triageFailed

export const parkTriage = internalMutation({
  args: { messageId: v.id('messages'), runId: v.id('backfillRuns') },
  returns: v.null(),
  handler: async (ctx, { messageId, runId }) => {
    const message = await ctx.db.get('messages', messageId)
    // A retried step may park the same email twice; count it once.
    if (!message || message.triageParked) return null
    // Resume may have landed since classify checked, and it won't come back for this email: sort it now.
    if (!(await ctx.db.get('backfillRuns', runId))?.paused) {
      await startTriage(ctx, messageId)
      return null
    }
    await ctx.db.patch('messages', messageId, { triageParked: true })
    await counters.add(ctx, counterKey(runId, 'parked'), 1)
    return null
  },
})

// Runs when a triage workflow ends. If every retry failed, the email leaves Reading for Needs action.
export const onTriageDone = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ messageId: v.id('messages') }) },
  returns: v.null(),
  handler: async (ctx, { result, context: { messageId } }) => {
    if (result.kind !== 'failed') return null
    const message = await ctx.db.get('messages', messageId)
    if (!message || message.route || message.userMoved) return null
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
