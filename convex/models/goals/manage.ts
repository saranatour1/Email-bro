import { ConvexError, v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internalQuery } from '../../_generated/server'
import { userMutation, userQuery } from '../../lib/functions'
import type { MutationCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

// Every active goal is an option in each Jev call, so keep the list short.
const MAX_GOALS = 10

const getOwned = async (ctx: MutationCtx & { userId: Id<'users'> }, goalId: Id<'goals'>) => {
  const goal = await ctx.db.get('goals', goalId)
  if (!goal || goal.userId !== ctx.userId) throw new ConvexError('Goal not found')
  return goal
}

const list = userQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) =>
    await ctx.db
      .query('goals')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate(paginationOpts),
})

const create = userMutation({
  args: { title: v.string(), details: v.optional(v.string()) },
  handler: async (ctx, { title, details }) => {
    title = title.trim()
    details = details?.trim() || undefined
    if (!title || title.length > 80) throw new ConvexError('Give the goal a title (up to 80 characters)')
    if (details && details.length > 300) throw new ConvexError('Keep the details under 300 characters')
    const { page } = await ctx.db
      .query('goals')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .paginate({ numItems: MAX_GOALS, cursor: null })
    if (page.length >= MAX_GOALS) throw new ConvexError(`You can have up to ${MAX_GOALS} goals`)
    await ctx.db.insert('goals', { userId: ctx.userId, title, details, active: true })
  },
})

const setActive = userMutation({
  args: { goalId: v.id('goals'), active: v.boolean() },
  handler: async (ctx, { goalId, active }) => {
    await getOwned(ctx, goalId)
    await ctx.db.patch('goals', goalId, { active })
  },
})

const remove = userMutation({
  args: { goalId: v.id('goals') },
  handler: async (ctx, { goalId }) => {
    await getOwned(ctx, goalId)
    await ctx.db.delete('goals', goalId)
  },
})

export const manageApi = { list, create, setActive, remove }

export const forTriage = internalQuery({
  args: { userId: v.id('users') },
  returns: v.array(v.object({ _id: v.id('goals'), title: v.string(), details: v.optional(v.string()) })),
  handler: async (ctx, { userId }) => {
    const { page } = await ctx.db
      .query('goals')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: MAX_GOALS, cursor: null })
    return page.filter((g) => g.active).map(({ _id, title, details }) => ({ _id, title, details }))
  },
})
