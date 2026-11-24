import { Outlet, createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../convex/_generated/dataModel'
import { AppShell } from '~/components/app-shell'
import { AuthGate } from '~/components/auth-gate'

// Pathless layout for every signed-in page. `inbox` scopes all views to one mailbox; `label` narrows a list to one label.
const Layout = () => {
  const { inbox } = Route.useSearch()
  return (
    <AuthGate>
      <AppShell inbox={inbox}>
        <Outlet />
      </AppShell>
    </AuthGate>
  )
}

export const Route = createFileRoute('/_app')({
  validateSearch: (s: Record<string, unknown>): { inbox?: Id<'mailboxes'>; label?: Id<'labels'> } => ({
    inbox: typeof s.inbox === 'string' ? (s.inbox as Id<'mailboxes'>) : undefined,
    label: typeof s.label === 'string' ? (s.label as Id<'labels'>) : undefined,
  }),
  // The session token lives in the browser, so these pages render on the client.
  ssr: false,
  component: Layout,
})
