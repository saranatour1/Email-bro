import { internal } from '../../_generated/api'
import { gmailFetch } from '../../lib/gmail'
import { decodeHeader, parseSender } from '../../lib/mail'
import type { ActionCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'

type Metadata = {
  id: string
  threadId: string
  labelIds?: Array<string>
  internalDate: string
  payload: { headers: Array<{ name: string; value: string }> }
}

// Reads headers only: the body stays in Gmail until the user opens the email.
export const ingestGmailMessage = async (
  ctx: ActionCtx,
  token: string,
  mailboxId: Id<'mailboxes'>,
  gmailId: string,
  backfillRunId?: Id<'backfillRuns'>,
) => {
  const params = new URLSearchParams({ format: 'metadata' })
  for (const name of ['From', 'Subject', 'Message-ID']) params.append('metadataHeaders', name)
  const msg = (await gmailFetch(token, `/messages/${gmailId}?${params}`)) as Metadata
  // History also reports sent mail and drafts.
  if (!msg.labelIds?.includes('INBOX')) return
  const header = (name: string) => msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
  await ctx.runMutation(internal.models.messages.ingest.ingest, {
    mailboxId,
    externalId: msg.id,
    threadId: msg.threadId,
    backfillRunId,
    mail: {
      rfcMessageId: header('Message-ID'),
      fromName: parseSender(header('From') ?? ''),
      subject: decodeHeader(header('Subject') ?? '') || '(no subject)',
      receivedAt: Number(msg.internalDate) || Date.now(),
    },
  })
}
