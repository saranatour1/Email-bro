import { ConvexError } from 'convex/values'
import { accessToken, gmailFetch } from '../../lib/gmail'
import { decrypt } from '../../lib/crypto'
import { base64UrlToBytes, parseRaw } from '../../lib/mail'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import type { ParsedMail } from '../../lib/mail'

export const getOwned = async (ctx: (QueryCtx | MutationCtx) & { userId: Id<'users'> }, messageId: Id<'messages'>) => {
  const message = await ctx.db.get('messages', messageId)
  if (!message || message.userId !== ctx.userId) throw new ConvexError('Message not found')
  return message
}

// Fetches the full email for this request only: from Gmail, or by decrypting domain mail.
export const loadMail = async (ctx: ActionCtx, message: Doc<'messages'>): Promise<ParsedMail> => {
  if (message.raw) {
    const blob = await ctx.storage.get(message.raw.fileId)
    if (!blob) throw new Error('Email content is missing')
    return parseRaw(await decrypt(await blob.arrayBuffer(), message.raw.iv))
  }
  const token = await accessToken(ctx, message.mailboxId)
  const { raw } = (await gmailFetch(token, `/messages/${message.externalId}?format=raw`)) as { raw: string }
  return parseRaw(base64UrlToBytes(raw))
}
