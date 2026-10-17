// Fetched emails Jev hasn't sorted yet, minus the ones Pause is holding.
export const readingCount = (counts: Record<string, number>) =>
  Math.max(0, counts.fetched - counts.sorted - counts.parked)

// This run still has mail waiting, in fetch, or with Jev. Another user's worker does not count.
export const runBusy = (counts: Record<string, number>) => {
  const waiting = counts.queued + counts.retry - counts.claimed
  const fetching = counts.claimed - (counts.fetched + counts.skipped + counts.failed + counts.retry)
  return waiting > 0 || fetching > 0 || readingCount(counts) > 0
}
