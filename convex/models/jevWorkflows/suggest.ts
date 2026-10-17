import { v } from 'convex/values'
import { Output, generateText, jsonSchema } from 'ai'
import { convexGateway } from '@convex-dev/ai-sdk-provider'
import { internal } from '../../_generated/api'
import { internalQuery } from '../../_generated/server'
import { userAction } from '../../lib/functions'
import { vWorkflowAction } from '../../schema'
import type { Infer } from 'convex/values'

const MODEL = 'anthropic/claude-haiku-5.5'
const ACTIONS = new Set<string>(vWorkflowAction.members.map((m) => m.value))

type Suggestion = { name: string; condition: string; action: Infer<typeof vWorkflowAction>; why: string }

// Haiku proposes workflows from your mail's metadata (senders, subjects, Jev's routes and what you did
// with them). Nothing is stored; the user adds the ones they like.
const suggest = userAction({
  args: {},
  handler: async (ctx): Promise<Array<Suggestion>> => {
    const context = await ctx.runQuery(internal.models.jevWorkflows.suggest.context, { userId: ctx.userId })
    if (context.emails === 0) return []
    const { output } = await generateText({
      model: convexGateway.messages(MODEL),
      maxOutputTokens: 2000,
      output: Output.array({
        element: jsonSchema<Suggestion>({
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short name, 2-4 words' },
            condition: { type: 'string', description: 'A yes/no question Jev answers about one email' },
            action: { type: 'string', enum: [...ACTIONS] },
            why: { type: 'string', description: 'One sentence citing the pattern in their mail' },
          },
          required: ['name', 'condition', 'action', 'why'],
          additionalProperties: false,
        }),
      }),
      system:
        "You design email workflows for one person. A workflow is a yes/no question that a decision model (Jev) answers about each new email, plus where matching mail goes: focus (keep in their inbox), in_progress, done, cancelled or spam. Study their senders, subjects and what they already do with that mail, then suggest 3-5 workflows that would save them the most clicks. Prefer patterns that repeat. Write conditions about meaning, not exact sender names (filters handle exact matches). Don't repeat their existing workflows.",
      prompt: JSON.stringify(context),
    })
    // Keep only well-formed suggestions; the model's output is untrusted.
    return output
      .filter((s) => ACTIONS.has(s.action) && s.name.trim() && s.condition.trim().length >= 8)
      .slice(0, 5)
      .map((s) => ({
        name: s.name.trim().slice(0, 80),
        condition: s.condition.trim().slice(0, 500),
        action: s.action,
        why: s.why.trim().slice(0, 200),
      }))
  },
})

export const suggestApi = { suggest }

export const context = internalQuery({
  args: { userId: v.id('users') },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    const { page } = await ctx.db
      .query('messages')
      .withIndex('by_userId_and_receivedAt', (q) => q.eq('userId', userId))
      .order('desc')
      .paginate({ numItems: 300, cursor: null })
    // One paginated query per function: the other reads are fixed-size takes.
    const workflows = await ctx.db
      .query('jevWorkflows')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(20)
    const goals = await ctx.db
      .query('goals')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(10)

    const senders = new Map<
      string,
      { emails: number; routes: Record<string, number>; handled: Record<string, number> }
    >()
    for (const m of page) {
      const s = senders.get(m.fromName) ?? { emails: 0, routes: {}, handled: {} }
      s.emails++
      if (m.route) s.routes[m.route] = (s.routes[m.route] ?? 0) + 1
      if (m.status !== 'inbox') s.handled[m.status] = (s.handled[m.status] ?? 0) + 1
      senders.set(m.fromName, s)
    }
    return {
      emails: page.length,
      topSenders: [...senders.entries()]
        .sort((a, b) => b[1].emails - a[1].emails)
        .slice(0, 25)
        .map(([name, s]) => ({ name, ...s })),
      recentSubjects: page.slice(0, 40).map((m) => m.subject.slice(0, 80)),
      existingWorkflows: workflows.map((w) => w.condition),
      goals: goals.filter((g) => g.active).map((g) => g.title),
    }
  },
})
