import { customAction, customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions'
import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError } from 'convex/values'
import { action, mutation, query } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'

type AuthCtx = Parameters<typeof getAuthUserId>[0]

// Public functions that need a signed-in user get `ctx.userId`.
const requireUserId = async (ctx: AuthCtx) => {
  const userId = await getAuthUserId<'users'>(ctx)
  if (userId === null) throw new ConvexError('Not signed in')
  return { userId }
}
const withUser = customCtx(requireUserId)

// shortcut: an action's `runQuery` type has no options argument, so it doesn't match what Convex Auth declares, though
// the call is the same at runtime. Drop the cast once `getAuthUserId` accepts an action context.
const withActionUser = customCtx((ctx: ActionCtx) => requireUserId(ctx as unknown as AuthCtx))

export const userQuery = customQuery(query, withUser)
export const userMutation = customMutation(mutation, withUser)
export const userAction = customAction(action, withActionUser)
