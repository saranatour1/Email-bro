import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'
import appCss from '~/styles/app.css?url'

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
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  notFoundComponent: () => <div>Route not found</div>,
  component: RootComponent,
})
