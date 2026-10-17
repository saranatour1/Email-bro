// Gmail puts the mailbox tip in `historyId`. That tip covers later pages too.
// Saving it before the last page drops every message on those pages.
export type GmailHistoryPage = {
  historyId: string
  nextPageToken?: string
  history?: Array<{ id?: string; messagesAdded?: Array<{ message?: { id?: string } }> }>
}

export type HistoryCursor = { ids: Array<string>; historyId?: string; hasMore: boolean }

const SYNC_GAP_MS = 60_000

export const historyCursor = (startHistoryId: string, pages: Array<GmailHistoryPage>): HistoryCursor => {
  const ids: Array<string> = []
  let lastRecordId: string | undefined
  for (const page of pages) {
    for (const record of page.history ?? []) {
      if (record.id) lastRecordId = record.id
      for (const added of record.messagesAdded ?? []) {
        const id = added.message?.id
        if (id) ids.push(id)
      }
    }
  }
  const unique = [...new Set(ids)]
  const last = pages.at(-1)
  const caughtUp = last !== undefined && !last.nextPageToken
  if (caughtUp) return { ids: unique, historyId: last.historyId, hasMore: false }
  if (lastRecordId && lastRecordId !== startHistoryId) {
    return { ids: unique, historyId: lastRecordId, hasMore: true }
  }
  return { ids: unique, hasMore: false }
}

export const shouldSyncMailbox = (mailbox: { provider: string; lastSyncedAt?: number }, now: number) =>
  mailbox.provider === 'gmail' && (mailbox.lastSyncedAt ?? 0) <= now - SYNC_GAP_MS

export const mergeLabelIds = (current: Record<string, string> | undefined, incoming: Record<string, string>) => ({
  ...current,
  ...incoming,
})
