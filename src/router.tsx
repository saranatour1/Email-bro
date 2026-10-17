import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache/provider'
import { routeTree } from './routeTree.gen'
import { api } from '~/lib/api'

export const getRouter = () => {
  const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL!
  if (!CONVEX_URL) {
    console.error('missing envar CONVEX_URL')
  }
  const convexQueryClient = new ConvexQueryClient(CONVEX_URL)

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: { queryKeyHashFn: convexQueryClient.hashFn(), queryFn: convexQueryClient.queryFn(), gcTime: 5000 },
    },
  })
  convexQueryClient.connect(queryClient)

  const router = routerWithQueryClient(
    createRouter({
      routeTree,
      defaultPreload: 'intent',
      context: { queryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0, // Let React Query handle all caching
      defaultErrorComponent: (err) => <p>{err.error instanceof Error ? err.error.stack : String(err.error)}</p>,
      defaultNotFoundComponent: () => <p>not found</p>,
      Wrap: ({ children }) => (
        <ConvexAuthProvider client={convexQueryClient.convexClient} api={api.auth}>
          {/* Keeps query subscriptions alive after a page unmounts, so going back renders instantly. */}
          <ConvexQueryCacheProvider>{children}</ConvexQueryCacheProvider>
        </ConvexAuthProvider>
      ),
    }),
    queryClient,
  )

  return router
}
