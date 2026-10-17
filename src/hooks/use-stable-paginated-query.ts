import { useRef } from 'react'
import { usePaginatedQuery } from 'convex-helpers/react/cache/hooks'

// Like usePaginatedQuery, but keeps showing the last loaded page while new args load, so switching
// views or inboxes swaps the list in place instead of flashing "Loading…".
export const useStablePaginatedQuery = ((...args: Parameters<typeof usePaginatedQuery>) => {
  const result = usePaginatedQuery(...args)
  const stored = useRef(result)
  if (result.status !== 'LoadingFirstPage') stored.current = result
  return stored.current
}) as typeof usePaginatedQuery
