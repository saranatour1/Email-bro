import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import { ChevronDown, Mail } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { ListView } from '~/components/app-shell'
import type { Display } from '~/components/display-options'
import { api } from '~/lib/api'
import { labelMeta } from '~/lib/status'
import { cn } from '~/lib/utils'
import { StatusMenu } from '~/components/status-menu'
import { Button } from '~/components/ui/button'
import { ScrollArea } from '~/components/ui/scroll-area'

type Row = Omit<Doc<'messages'>, 'text'>

const EMPTY: Partial<Record<ListView, string>> = {
  focus: 'Nothing needs you right now.',
  in_progress: 'Nothing in progress.',
  snoozed: 'Nothing snoozed.',
}

export const MessageList = ({
  view,
  inbox,
  display,
  compact,
  selectedId,
}: {
  view: ListView
  inbox?: Id<'mailboxes'>
  display: Display
  compact: boolean
  selectedId?: Id<'messages'>
}) => {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { view, mailboxId: inbox },
    { initialNumItems: 50 },
  )
  const { results: mailboxes } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const addressOf = (id: Id<'mailboxes'>) => mailboxes.find((m) => m._id === id)?.address
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (status === 'LoadingFirstPage') return <Empty>Loading…</Empty>
  if (results.length === 0) return <Empty>{EMPTY[view] ?? 'No mail here.'}</Empty>

  return (
    <ScrollArea className="min-h-0 flex-1">
      {groupByDay(results).map(([day, rows]) => {
        const open = !collapsed.has(day)
        return (
          <section key={day}>
            {/* Linear-style group band: "Yesterday 3" */}
            <button
              type="button"
              aria-expanded={open}
              onClick={() =>
                setCollapsed((c) => {
                  const next = new Set(c)
                  if (open) next.add(day)
                  else next.delete(day)
                  return next
                })
              }
              className="sticky top-0 z-10 flex h-9 w-full items-center gap-2 bg-muted/70 px-4 text-[13px] backdrop-blur"
            >
              <ChevronDown className={cn('size-3 text-muted-foreground transition-transform', !open && '-rotate-90')} />
              <span className="font-medium">{day}</span>
              <span className="text-muted-foreground">{rows.length}</span>
            </button>
            {open && (
              <ul>
                {rows.map((m) => (
                  <MessageRow
                    key={m._id}
                    m={m}
                    view={view}
                    display={display}
                    compact={compact}
                    selected={m._id === selectedId}
                    address={inbox ? undefined : addressOf(m.mailboxId)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
      {status === 'CanLoadMore' && (
        <div className="p-3">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => loadMore(50)}>
            Load more
          </Button>
        </div>
      )}
    </ScrollArea>
  )
}

const MessageRow = ({
  m,
  view,
  display,
  compact,
  selected,
  address,
}: {
  m: Row
  view: ListView
  display: Display
  compact: boolean
  selected: boolean
  // Shown only in "All inboxes", like Linear's project chip.
  address?: string
}) => {
  const sender = m.fromName
  const label = display.labels && m.category && m.category !== view ? labelMeta(m.category) : undefined

  return (
    <li
      className={cn(
        'flex items-center gap-1.5 px-2.5 text-[13px] hover:bg-accent/50',
        compact ? 'py-2' : 'h-10',
        selected && 'bg-accent',
      )}
    >
      <StatusMenu messageId={m._id} status={m.status} snoozedUntil={m.snoozedUntil} />
      <Link
        to="/mail/$view/$messageId"
        params={{ view, messageId: m._id }}
        search={true}
        className={cn('flex min-w-0 flex-1', compact ? 'flex-col' : 'items-center gap-3')}
      >
        {compact ? (
          <>
            <span className="flex items-center gap-2">
              <span className={cn('min-w-0 flex-1 truncate', !m.read && 'font-semibold')}>{sender}</span>
              {display.dates && (
                <time className="shrink-0 text-xs text-muted-foreground">{shortDate(m.receivedAt)}</time>
              )}
            </span>
            <span className="truncate text-muted-foreground">{m.subject}</span>
          </>
        ) : (
          <>
            <span className={cn('w-36 shrink-0 truncate', m.read ? 'text-muted-foreground' : 'font-medium')}>
              {sender}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className={cn(!m.read && 'font-medium')}>{m.subject}</span>
            </span>
            {label && (
              <Pill>
                <span className={cn('size-1.5 rounded-full', label.dot)} />
                {label.label}
              </Pill>
            )}
            {address && (
              <Pill className="hidden max-w-48 font-mono lg:flex">
                <Mail className="size-3" />
                <span className="truncate">{address}</span>
              </Pill>
            )}
            {display.dates && (
              <time className="w-16 shrink-0 text-right text-xs text-muted-foreground">{shortDate(m.receivedAt)}</time>
            )}
          </>
        )}
      </Link>
    </li>
  )
}

export const Pill = ({ children, className, title }: { children: ReactNode; className?: string; title?: string }) => {
  return (
    <span
      title={title}
      className={cn(
        'flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

const Empty = ({ children }: { children: ReactNode }) => {
  return <p className="flex-1 p-8 text-center text-sm text-muted-foreground">{children}</p>
}

// Rows arrive newest first, so consecutive runs share a day bucket.
const groupByDay = (rows: Array<Row>): Array<[string, Array<Row>]> => {
  const groups: Array<[string, Array<Row>]> = []
  for (const row of rows) {
    const day = dayLabel(row.receivedAt)
    const last = groups.at(-1)
    if (last?.[0] === day) last[1].push(row)
    else groups.push([day, [row]])
  }
  return groups
}

const dayLabel = (ms: number) => {
  const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(ms).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

export const shortDate = (ms: number) => {
  const d = new Date(ms)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
