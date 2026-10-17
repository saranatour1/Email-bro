// This run still has mail waiting, in fetch, or with Jev. Another user's worker does not count.
export const runBusy = (counts: Record<string, number>) => {
  const waiting = counts.queued + counts.retry - counts.claimed
  const fetching = counts.claimed - (counts.fetched + counts.skipped + counts.failed + counts.retry)
  const reading = counts.fetched - counts.sorted
  return waiting > 0 || fetching > 0 || reading > 0
}
