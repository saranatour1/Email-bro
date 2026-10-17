import { customAction, customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions'
import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError } from 'convex/values'
import { action, mutation, query } from '../_generated/server'
import type { Auth } from 'convex/server'

// Public functions that need a signed-in user get `ctx.userId`.
const withUser = customCtx(async (ctx: { auth: Auth }) => {
  const userId = await getAuthUserId<'users'>(ctx)
  if (userId === null) throw new ConvexError('Not signed in')
  return { userId }
})

export const userQuery = customQuery(query, withUser)
export const userMutation = customMutation(mutation, withUser)
export const userAction = customAction(action, withUser)
