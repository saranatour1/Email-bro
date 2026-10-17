import { ConvexError, v } from 'convex/values'
import { literals } from 'convex-helpers/validators'
import { userMutation } from '../../lib/functions'

// An address on your own domain. Cloudflare Email Routing delivers it; see workers/inbound.
const addDomainMailbox = userMutation({
  args: { address: v.string(), sendVia: literals('cloudflare', 'resend') },
  handler: async (ctx, { address, sendVia }) => {
    address = address.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      throw new ConvexError('That is not a valid email address')
    }
    const existing = await ctx.db
      .query('mailboxes')
      .withIndex('by_address', (q) => q.eq('address', address))
      .first()
    if (existing) throw new ConvexError('That address is already connected')
    await ctx.db.insert('mailboxes', { userId: ctx.userId, address, provider: 'domain', sendVia, status: 'active' })
  },
})

export const domainApi = { addDomainMailbox }
