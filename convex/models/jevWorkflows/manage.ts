import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internalQuery } from '../../_generated/server'
import { userMutation, userQuery } from '../../lib/functions'
import { vWorkflowAction } from '../../schema'
import type { MutationCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

// Every enabled workflow becomes one Jev question per email, so keep the set small.
const MAX_WORKFLOWS = 20

const getOwned = async (ctx: MutationCtx & { userId: Id<'users'> }, workflowId: Id<'jevWorkflows'>) => {
  const workflow = await ctx.db.get('jevWorkflows', workflowId)
  if (!workflow || workflow.userId !== ctx.userId) throw new ConvexError('Workflow not found')
  return workflow
}

const list = userQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) =>
    await ctx.db
      .query('jevWorkflows')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate(paginationOpts),
})

const create = userMutation({
  args: {
    name: v.string(),
    condition: v.string(),
    action: vWorkflowAction,
    mailboxId: v.optional(v.id('mailboxes')),
  },
  handler: async (ctx, { name, condition, action, mailboxId }) => {
    name = name.trim()
    condition = condition.trim()
    if (!name || name.length > 80) throw new ConvexError('Give the workflow a name (up to 80 characters)')
    if (condition.length < 8 || condition.length > 500) throw new ConvexError('Describe the condition in 8–500 characters')
    if (mailboxId && (await ctx.db.get('mailboxes', mailboxId))?.userId !== ctx.userId) {
      throw new ConvexError('Mailbox not found')
    }
    const { page } = await ctx.db
      .query('jevWorkflows')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate({ numItems: MAX_WORKFLOWS, cursor: null })
    if (page.length >= MAX_WORKFLOWS) throw new ConvexError(`You can have up to ${MAX_WORKFLOWS} workflows`)
    await ctx.db.insert('jevWorkflows', { userId: ctx.userId, name, condition, action, mailboxId, enabled: true })
  },
})

const setEnabled = userMutation({
  args: { workflowId: v.id('jevWorkflows'), enabled: v.boolean() },
  handler: async (ctx, { workflowId, enabled }) => {
    await getOwned(ctx, workflowId)
    await ctx.db.patch('jevWorkflows', workflowId, { enabled })
  },
})

const remove = userMutation({
  args: { workflowId: v.id('jevWorkflows') },
  handler: async (ctx, { workflowId }) => {
    await getOwned(ctx, workflowId)
    await ctx.db.delete('jevWorkflows', workflowId)
  },
})

export const manageApi = { list, create, setEnabled, remove }

export const forTriage = internalQuery({
  args: { userId: v.id('users'), mailboxId: v.id('mailboxes') },
  returns: v.array(v.object({ _id: v.id('jevWorkflows'), condition: v.string(), action: vWorkflowAction })),
  handler: async (ctx, { userId, mailboxId }) => {
    const { page } = await ctx.db
      .query('jevWorkflows')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: MAX_WORKFLOWS, cursor: null })
    return page
      .filter((w) => w.enabled && (!w.mailboxId || w.mailboxId === mailboxId))
      .map(({ _id, condition, action }) => ({ _id, condition, action }))
  },
})
