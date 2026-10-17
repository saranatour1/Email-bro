import { ConvexError, v } from 'convex/values'
import { internal } from '../../../_generated/api'
import { env, internalMutation, internalQuery } from '../../../_generated/server'
import { userAction } from '../../../lib/functions'
import { gmailFetch, tokenRequest } from '../../../lib/gmail'
import schema from '../../../schema'
import type { ActionCtx } from '../../../_generated/server'

// gmail.modify = read, label, archive and send. It never allows permanent delete.
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
const redirectUri = () => `${env.CONVEX_SITE_URL}/gmail/callback`

const startGmailConnect = userAction({
  args: {},
  handler: async (ctx) => {
    const state = crypto.randomUUID()
    await ctx.runMutation(internal.models.mailboxes.gmail.connect.saveOauthState, { state, userId: ctx.userId })
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent', // always return a refresh token, even on reconnect
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  },
})

export const connectApi = { startGmailConnect }

// Called by the /gmail/callback HTTP route. Returns where to send the browser.
export const finishConnect = async (ctx: ActionCtx, code: string, state: string) => {
  const userId = await ctx.runMutation(internal.models.mailboxes.gmail.connect.consumeOauthState, { state })
  if (!userId) return `${env.SITE_URL}/settings?error=expired`
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() })
  if (!tokens.refresh_token) return `${env.SITE_URL}/settings?error=no_refresh_token`
  const profile = (await gmailFetch(tokens.access_token, '/profile')) as { emailAddress: string; historyId: string }
  const mailboxId = await ctx.runMutation(internal.models.mailboxes.gmail.connect.upsertGmail, {
    userId,
    address: profile.emailAddress,
    historyId: profile.historyId,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  })
  await ctx.scheduler.runAfter(0, internal.models.mailboxes.gmail.sync.sync, { mailboxId })
  return `${env.SITE_URL}/settings?connected=${encodeURIComponent(profile.emailAddress)}`
}

export const saveOauthState = internalMutation({
  args: { state: v.string(), userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('oauthStates', { ...args, expiresAt: Date.now() + 10 * 60_000 })
    return null
  },
})

export const consumeOauthState = internalMutation({
  args: { state: v.string() },
  returns: v.union(v.id('users'), v.null()),
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query('oauthStates')
      .withIndex('by_state', (q) => q.eq('state', state))
      .unique()
    if (!row) return null
    await ctx.db.delete('oauthStates', row._id)
    return row.expiresAt > Date.now() ? row.userId : null
  },
})

export const upsertGmail = internalMutation({
  args: {
    userId: v.id('users'),
    address: v.string(),
    historyId: v.string(),
    refreshToken: v.string(),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id('mailboxes'),
  handler: async (ctx, { userId, address, historyId, ...tokens }) => {
    address = address.toLowerCase()
    const existing = await ctx.db
      .query('mailboxes')
      .withIndex('by_address', (q) => q.eq('address', address))
      .first()
    if (existing && existing.userId !== userId) {
      throw new ConvexError('This mailbox is connected to another account')
    }
    const mailboxId =
      existing?._id ??
      (await ctx.db.insert('mailboxes', { userId, address, provider: 'gmail', status: 'active', historyId }))
    if (existing) await ctx.db.patch('mailboxes', mailboxId, { status: 'active', lastError: undefined })
    const secret = await ctx.db
      .query('mailboxSecrets')
      .withIndex('by_mailboxId', (q) => q.eq('mailboxId', mailboxId))
      .unique()
    if (secret) await ctx.db.patch('mailboxSecrets', secret._id, tokens)
    else await ctx.db.insert('mailboxSecrets', { mailboxId, ...tokens })
    return mailboxId
  },
})

export const getSecret = internalQuery({
  args: { mailboxId: v.id('mailboxes') },
  returns: v.union(schema.doc('mailboxSecrets'), v.null()),
  handler: (ctx, { mailboxId }) =>
    ctx.db
      .query('mailboxSecrets')
      .withIndex('by_mailboxId', (q) => q.eq('mailboxId', mailboxId))
      .unique(),
})

export const saveAccessToken = internalMutation({
  args: { mailboxId: v.id('mailboxes'), accessToken: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { mailboxId, ...tokens }) => {
    const secret = await ctx.db
      .query('mailboxSecrets')
      .withIndex('by_mailboxId', (q) => q.eq('mailboxId', mailboxId))
      .unique()
    if (secret) await ctx.db.patch('mailboxSecrets', secret._id, tokens)
    return null
  },
})
