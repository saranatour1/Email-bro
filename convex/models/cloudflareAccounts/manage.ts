import { ConvexError, v } from 'convex/values'
import { routingEnabled } from '@sarant/cloudflare-email-component/cloudflare'
import { components, internal } from '../../_generated/api'
import { internalMutation, internalQuery } from '../../_generated/server'
import { userAction, userMutation, userQuery } from '../../lib/functions'
import { seal } from '../../lib/crypto'

// A user's Cloudflare credentials are deleted this long after they're entered.
const CREDENTIALS_TTL_MS = 30 * 24 * 60 * 60 * 1000
// How long the component keeps its sealed copy of a sent email.
export const COPY_TTL_MS = 7 * 24 * 60 * 60 * 1000

type Zone = { id: string; account?: { id?: string } }

// Checks the token against Cloudflare, then stores it sealed with the user's key until it expires.
const connect = userAction({
  args: { accountId: v.string(), apiToken: v.string(), domain: v.string() },
  handler: async (ctx, args) => {
    const accountId = args.accountId.trim()
    const apiToken = args.apiToken.trim()
    const domain = args.domain.trim().toLowerCase()
    if (!/^[0-9a-f]{32}$/.test(accountId)) throw new ConvexError('That account ID should be 32 letters and numbers')
    if (!apiToken) throw new ConvexError('Paste an API token')
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new ConvexError('Enter a domain like example.com')

    const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    const body = (await res.json().catch(() => null)) as { success?: boolean; result?: Array<Zone> } | null
    if (!res.ok || !body?.success) throw new ConvexError("Cloudflare didn't accept that token")
    const zone = body.result?.[0]
    if (!zone) throw new ConvexError(`That token can't see ${domain}. Give it Zone read access to the domain.`)
    if (zone.account?.id && zone.account.id !== accountId) {
      throw new ConvexError(`${domain} belongs to a different Cloudflare account`)
    }
    if (!(await routingEnabled(zone.id, apiToken))) {
      throw new ConvexError(`Turn on Email Routing for ${domain} in the Cloudflare dashboard first`)
    }

    const sealed = await seal(ctx.userId, 'cloudflare', JSON.stringify({ accountId, apiToken, zoneId: zone.id }))
    await ctx.runMutation(internal.models.cloudflareAccounts.manage.save, { userId: ctx.userId, domain, sealed })
  },
})

// What the settings page shows: never the credentials themselves.
const status = userQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('cloudflareAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .first()
    return row ? { domain: row.domain, expiresAt: row.expiresAt } : null
  },
})

const disconnect = userMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('cloudflareAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.userId))
      .first()
    if (row) await ctx.db.delete('cloudflareAccounts', row._id)
  },
})

export const manageApi = { connect, status, disconnect }

// One account per user: a new token replaces the old one and starts a new 30 days.
export const save = internalMutation({
  args: { userId: v.id('users'), domain: v.string(), sealed: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, domain, sealed }) => {
    const existing = await ctx.db
      .query('cloudflareAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
    if (existing) await ctx.db.delete('cloudflareAccounts', existing._id)
    const expiresAt = Date.now() + CREDENTIALS_TTL_MS
    const id = await ctx.db.insert('cloudflareAccounts', { userId, domain, sealed, expiresAt })
    await ctx.scheduler.runAt(expiresAt, internal.models.cloudflareAccounts.manage.expire, { id })
    return null
  },
})

export const expire = internalMutation({
  args: { id: v.id('cloudflareAccounts') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    // Already gone if the user disconnected or entered a new token.
    if (await ctx.db.get('cloudflareAccounts', id)) await ctx.db.delete('cloudflareAccounts', id)
    return null
  },
})

// Only for internal actions; expired rows count as gone even if the delete hasn't run yet.
export const getSealed = internalQuery({
  args: { userId: v.id('users') },
  returns: v.union(v.object({ domain: v.string(), sealed: v.string() }), v.null()),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query('cloudflareAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
    return row && row.expiresAt > Date.now() ? { domain: row.domain, sealed: row.sealed } : null
  },
})

// Deletes the component's sealed copy of a sent email, COPY_TTL_MS after sending.
export const forgetCopy = internalMutation({
  args: { owner: v.string(), emailId: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner, emailId }) => {
    await ctx.runMutation(components.cloudflareEmail.lib.remove, { owner, emailId })
    return null
  },
})
