import { getAuthUserId } from '@convex-dev/auth/server'
import { vGoogleProfile } from '@convex-dev/auth/methods/google/server'
import { v } from 'convex/values'
import { internalMutation, query } from '../../_generated/server'

const vMethod = v.object({ name: v.literal('google'), profile: vGoogleProfile })

export const createUser = internalMutation({
  args: { method: vMethod },
  returns: v.id('users'),
  handler: async (ctx, { method: { profile } }) => {
    // shortcut: Convex Auth 2.1 didn't carry over the Google account links from 2.0 beta, so a user from before the
    // upgrade is found again by their Google-verified email. Remove once every existing user has signed in once.
    if (profile.emailVerified && profile.email) {
      const existing = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', profile.email))
        .first()
      if (existing) return existing._id
    }
    return await ctx.db.insert('users', { name: profile.name, email: profile.email, image: profile.picture })
  },
})

// Keep name/avatar fresh on every sign-in.
export const onSignIn = internalMutation({
  args: { method: vMethod, userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { method: { profile }, userId }) => {
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
