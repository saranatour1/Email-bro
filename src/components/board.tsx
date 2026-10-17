import { useState } from 'react'
import { ChevronDown, Eye, EyeOff, MoreHorizontal } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery } from 'convex/react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { DragEvent, ReactNode } from 'react'
import type { ListView } from '~/components/app-shell'
import type { Display } from '~/components/display-options'
import type { Status } from '~/lib/status'
import { api } from '~/lib/api'
import { LABELS, StatusIcon, labelMeta } from '~/lib/status'
import { SNOOZE_OPTIONS } from '~/components/status-menu'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Pill, shortDate } from '~/components/message-list'

type Column = { view: ListView; title: string; icon: ReactNode; status?: Status }

// The Inbox column is Focus (inbox status, needs you); the noise Jev filed lives under its label.
const STATUS_COLUMNS: Array<Column> = (
  [
    ['focus', 'Inbox', 'inbox'],
    ['in_progress', 'In progress', 'in_progress'],
    ['snoozed', 'Snoozed', 'snoozed'],
    ['done', 'Done', 'done'],
    ['cancelled', 'Cancelled', 'cancelled'],
  ] as const
).map(([view, title, status]) => ({ view, title, status, icon: <StatusIcon status={status} /> }))

const LABEL_COLUMNS: Array<Column> = LABELS.filter((l) => l.id !== 'junk').map((l) => ({
  view: l.id,
  title: l.label,
  icon: <span className={cn('size-2 rounded-full', l.dot)} />,
}))

const DRAG_TYPE = 'application/x-email-bro-message'

export const Board = ({
  inbox,
  display,
  onDisplayChange,
  selectedId,
}: {
  inbox?: Id<'mailboxes'>
  display: Display
  onDisplayChange: (patch: Partial<Display>) => void
  selectedId?: Id<'messages'>
}) => {
  const columns = display.groupBy === 'status' ? STATUS_COLUMNS : LABEL_COLUMNS
  const isHidden = (c: Column) => display.hiddenColumns.includes(c.view)
  const hidden = columns.filter(isHidden)
  const hide = (view: string) => onDisplayChange({ hiddenColumns: [...display.hiddenColumns, view] })
  const show = (view: string) => onDisplayChange({ hiddenColumns: display.hiddenColumns.filter((h) => h !== view) })

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
      {columns
        .filter((c) => !isHidden(c))
        .map((c) => (
          <BoardColumn
            key={c.view}
            column={c}
            inbox={inbox}
            display={display}
            selectedId={selectedId}
            onHide={() => hide(c.view)}
          />
        ))}
      {hidden.length > 0 && <HiddenColumns columns={hidden} onShow={show} />}
    </div>
  )
}

// Dropping a card on a status column (visible or hidden) moves the email there.
const useColumnDrop = (column: Column) => {
  const setStatus = useMutation(api.messages.setStatus)
  const snooze = useMutation(api.messages.snooze)
  const [over, setOver] = useState(false)
  const target = column.status
  return {
    over,
    droppable: !!target,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!target || !e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        const messageId = e.dataTransfer.getData(DRAG_TYPE) as Id<'messages'>
        if (!messageId || !target) return
        if (target === 'snoozed') void snooze({ messageId, until: SNOOZE_OPTIONS[1].until() })
        else if (target !== 'spam') void setStatus({ messageId, status: target })
      },
    },
  }
}

const BoardColumn = ({
  column,
  inbox,
  display,
  selectedId,
  onHide,
}: {
  column: Column
  inbox?: Id<'mailboxes'>
  display: Display
  selectedId?: Id<'messages'>
  onHide: () => void
}) => {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { view: column.view, mailboxId: inbox },
    { initialNumItems: 25 },
  )
  const { over, droppable, handlers } = useColumnDrop(column)

  return (
    <section
      className={cn('group/column flex w-72 shrink-0 flex-col rounded-lg bg-muted/40', over && 'ring-2 ring-ring/40')}
      {...handlers}
    >
      <header className="flex h-10 items-center gap-2 pr-1.5 pl-3 text-sm">
        <span className="flex size-4 items-center justify-center">{column.icon}</span>
        <span className="font-medium">{column.title}</span>
        <span className="text-muted-foreground">
          {results.length}
          {status === 'CanLoadMore' && '+'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7 text-muted-foreground opacity-0 group-hover/column:opacity-100 data-[state=open]:opacity-100"
              aria-label={`${column.title} column options`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onHide}>
              <EyeOff /> Hide column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5">
        {results.map((m) => (
          <Card
            key={m._id}
            m={m}
            display={display}
            column={column}
            selected={m._id === selectedId}
            draggable={droppable}
          />
        ))}
        {status === 'CanLoadMore' && (
          <Button variant="ghost" size="sm" onClick={() => loadMore(25)}>
            Load more
          </Button>
        )}
      </div>
    </section>
  )
}

// Linear-style "Hidden columns" list after the last column; click a row to show it again.
const HiddenColumns = ({ columns, onShow }: { columns: Array<Column>; onShow: (view: string) => void }) => {
  const [open, setOpen] = useState(true)
  return (
    <section className="flex w-60 shrink-0 flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-10 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
        Hidden columns
      </button>
      {open && columns.map((c) => <HiddenColumn key={c.view} column={c} onShow={() => onShow(c.view)} />)}
    </section>
  )
}

const HiddenColumn = ({ column, onShow }: { column: Column; onShow: () => void }) => {
  const { over, handlers } = useColumnDrop(column)
  return (
    <button
      type="button"
      onClick={onShow}
      title="Show column"
      className={cn(
        'group/hidden flex h-10 items-center gap-2.5 rounded-lg bg-muted/40 px-3 text-sm hover:bg-muted',
        over && 'ring-2 ring-ring/40',
      )}
      {...handlers}
    >
      <span className="flex size-4 items-center justify-center">{column.icon}</span>
      {column.title}
      <Eye className="ml-auto size-3.5 text-muted-foreground opacity-0 group-hover/hidden:opacity-100" />
    </button>
  )
}

const Card = ({
  m,
  display,
  column,
  selected,
  draggable,
}: {
  m: Omit<Doc<'messages'>, 'text'>
  display: Display
  column: Column
  selected: boolean
  draggable: boolean
}) => {
  const label = display.labels && m.category && m.category !== column.view ? labelMeta(m.category) : undefined
  return (
    <Link
      to="/mail/$view/$messageId"
      params={{ view: 'board', messageId: m._id }}
      search={true}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, m._id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'flex flex-col gap-1 rounded-md border bg-card p-2.5 text-[13px] shadow-xs hover:border-ring/40',
        selected && 'border-ring/60',
      )}
    >
      <div className="flex items-center gap-2">
        {display.groupBy === 'label' && <StatusIcon status={m.status} />}
        <span className={cn('min-w-0 flex-1 truncate text-xs', m.read ? 'text-muted-foreground' : 'font-semibold')}>
          {m.fromName}
        </span>
        {display.dates && <time className="shrink-0 text-xs text-muted-foreground">{shortDate(m.receivedAt)}</time>}
      </div>
      <span className={cn('line-clamp-2', !m.read && 'font-medium')}>{m.subject}</span>
      {label && (
        <Pill className="mt-1 self-start">
          <span className={cn('size-1.5 rounded-full', label.dot)} />
          {label.label}
        </Pill>
      )}
    </Link>
  )
}
