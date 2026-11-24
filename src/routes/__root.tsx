import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import * as React from 'react'
import { DatabuddyProvider } from '@databuddy/sdk/react'
import type { QueryClient } from '@tanstack/react-query'
import appCss from '~/styles/app.css?url'

// Public client id for Databuddy analytics; without it, no tracker loads (e.g. local dev).
const DATABUDDY_CLIENT_ID = import.meta.env.VITE_DATABUDDY_CLIENT_ID as string | undefined

const RootComponent = () => {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

const RootDocument = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Follow the OS light/dark setting; shadcn themes key off the .dark class. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches)",
          }}
        />
      </head>
      <body>
        {children}
        {DATABUDDY_CLIENT_ID && (
          <DatabuddyProvider
            clientId={DATABUDDY_CLIENT_ID}
            autocapture={{ webVitals: true, errors: true }}
            // Replay keeps its defaults: page text and typed input are masked, so no email content is recorded.
            replay
            // Paths are recorded without the message id: /mail/focus/* instead of /mail/focus/<id>.
            maskPaths={['/mail/*/*']}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Email Bro' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  notFoundComponent: () => <div>Route not found</div>,
  component: RootComponent,
})
