import { getAuthUserId } from '@convex-dev/auth/server'
import { vGoogleProfile } from '@convex-dev/auth/methods/google/server'
import { v } from 'convex/values'
import { internalMutation, query } from '../../_generated/server'

const vProvider = v.object({ name: v.literal('google'), accountId: v.string(), profile: vGoogleProfile })

export const createUser = internalMutation({
  args: { provider: vProvider },
  returns: v.id('users'),
  handler: async (ctx, { provider: { profile } }) => {
    return await ctx.db.insert('users', { name: profile.name, email: profile.email, image: profile.picture })
  },
})

// Keep name/avatar fresh on every sign-in.
export const onSignIn = internalMutation({
  args: { provider: vProvider, userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { provider: { profile }, userId }) => {
    await ctx.db.patch('users', userId, { name: profile.name, email: profile.email, image: profile.picture })
    return null
  },
})

// Null when signed out, so the auth gate can render without throwing.
const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId<'users'>(ctx)
    return userId === null ? null : await ctx.db.get('users', userId)
  },
})

export const authApi = { me }
