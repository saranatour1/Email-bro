import { ConvexError } from 'convex/values'
import { internal } from '../_generated/api'
import { unseal } from './crypto'
import type { ActionCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

export type CloudflareCredentials = { accountId: string; apiToken: string; zoneId: string; domain: string }

// The user's own Cloudflare credentials, opened for this action only. Throws when they're missing or expired.
export const cloudflareCredentials = async (ctx: ActionCtx, userId: Id<'users'>): Promise<CloudflareCredentials> => {
  const row = await ctx.runQuery(internal.models.cloudflareAccounts.manage.getSealed, { userId })
  if (!row) {
    throw new ConvexError('Your Cloudflare token is missing or has expired. Enter it again in Mailboxes.')
  }
  const { accountId, apiToken, zoneId } = JSON.parse(await unseal(userId, 'cloudflare', row.sealed)) as Omit<
    CloudflareCredentials,
    'domain'
  >
  return { accountId, apiToken, zoneId, domain: row.domain }
}
