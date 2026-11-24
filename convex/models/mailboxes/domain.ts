import { ConvexError, v } from 'convex/values'
import { createRule, ruleFor, uploadWorker } from '@sarant/cloudflare-email-component/cloudflare'
import { internal } from '../../_generated/api'
import { env, internalMutation, internalQuery } from '../../_generated/server'
import { userAction, userMutation } from '../../lib/functions'
import { cloudflareCredentials } from '../../lib/cloudflare'
import { inboundSecretFor } from '../../lib/crypto'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

// One inbound Worker per user, in their own Cloudflare account.
const WORKER_NAME = 'email-bro-inbound'

const normalize = (address: string) => {
  address = address.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new ConvexError('That is not a valid email address')
  return address
}

const taken = async (ctx: QueryCtx | MutationCtx, address: string) =>
  !!(await ctx.db
    .query('mailboxes')
    .withIndex('by_address', (q) => q.eq('address', address))
    .first())

// An address on your own domain whose replies go out through Resend. Mail reaches it through the shared Worker in
// workers/inbound.
const addDomainMailbox = userMutation({
  args: { address: v.string() },
  handler: async (ctx, args) => {
    const address = normalize(args.address)
    if (await taken(ctx, address)) throw new ConvexError('That address is already connected')
    await ctx.db.insert('mailboxes', {
      userId: ctx.userId,
      address,
      provider: 'domain',
      sendVia: 'resend',
      status: 'active',
    })
  },
})

// An address on the domain of the user's own Cloudflare account: a routing rule sends its mail to the user's inbound
// Worker, and replies go out through Cloudflare Email Sending with the same account.
const addCloudflareMailbox = userAction({
  args: { address: v.string() },
  handler: async (ctx, args) => {
    const address = normalize(args.address)
    const cf = await cloudflareCredentials(ctx, ctx.userId)
    if (!address.endsWith(`@${cf.domain}`)) throw new ConvexError(`Use an address on ${cf.domain}`)
    if (await ctx.runQuery(internal.models.mailboxes.domain.isTaken, { address })) {
      throw new ConvexError('That address is already connected')
    }
    if (!env.CONVEX_SITE_URL) throw new ConvexError('CONVEX_SITE_URL is not set')
    if (await ruleFor(cf.zoneId, cf.apiToken, address)) {
      throw new ConvexError('That address already has a routing rule in Cloudflare. Remove it there first.')
    }
    await uploadWorker(cf.accountId, cf.apiToken, WORKER_NAME, {
      inboundUrl: `${env.CONVEX_SITE_URL}/inbound/email`,
      secret: await inboundSecretFor(ctx.userId),
    })
    await createRule(cf.zoneId, cf.apiToken, address, WORKER_NAME, 'Email Bro')
    await ctx.runMutation(internal.models.mailboxes.domain.insertCloudflare, { userId: ctx.userId, address })
  },
})

export const domainApi = { addDomainMailbox, addCloudflareMailbox }

export const isTaken = internalQuery({
  args: { address: v.string() },
  returns: v.boolean(),
  handler: (ctx, { address }) => taken(ctx, address),
})

export const insertCloudflare = internalMutation({
  args: { userId: v.id('users'), address: v.string() },
  returns: v.id('mailboxes'),
  handler: async (ctx, { userId, address }): Promise<Id<'mailboxes'>> => {
    if (await taken(ctx, address)) throw new ConvexError('That address is already connected')
    return await ctx.db.insert('mailboxes', {
      userId,
      address,
      provider: 'domain',
      sendVia: 'cloudflare',
      status: 'active',
    })
  },
})
