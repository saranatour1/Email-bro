import { Outlet, createFileRoute, notFound, useParams } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import type { View } from '~/components/app-shell'
import { api } from '~/lib/api'
import { PageHeader, isView, viewLabel } from '~/components/app-shell'
import { Board } from '~/components/board'
import { DisplayMenu, useDisplay } from '~/components/display-options'
import { MessageList } from '~/components/message-list'
import { cn } from '~/lib/utils'

// The list (or board) stays mounted while /mail/$view/$messageId renders the reader beside it.
const MailView = () => {
  const { view } = Route.useParams()
  const { inbox } = Route.useSearch()
  const { messageId } = useParams({ strict: false })
  const mailboxes = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const [display, setDisplay] = useDisplay()
  const board = view === 'board'

  return (
    <div className="flex min-h-0 flex-1">
      <section className={cn('flex min-w-0 flex-col', messageId && !board ? 'w-[22rem] shrink-0 border-r' : 'flex-1')}>
        <PageHeader>
          <h1 className="text-sm font-medium">{viewLabel(view)}</h1>
          <div className="ml-auto">
            <DisplayMenu display={display} onChange={setDisplay} board={board} />
          </div>
        </PageHeader>
        {mailboxes.status !== 'LoadingFirstPage' && mailboxes.results.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No inboxes yet. Add one from Mailboxes in the sidebar.
          </p>
        ) : board ? (
          <Board inbox={inbox} display={display} onDisplayChange={setDisplay} selectedId={messageId} />
        ) : (
          <MessageList view={view} inbox={inbox} display={display} compact={!!messageId} selectedId={messageId} />
        )}
      </section>
      <Outlet />
    </div>
  )
}

export const Route = createFileRoute('/_app/mail/$view')({
  params: {
    parse: ({ view }): { view: View } => {
      if (!isView(view)) throw notFound()
      return { view }
    },
    stringify: ({ view }) => ({ view }),
  },
  component: MailView,
})
