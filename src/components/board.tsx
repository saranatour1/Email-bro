import { useState } from 'react'
import {
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ScanText,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { usePaginatedQuery, useQuery } from 'convex-helpers/react/cache/hooks'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { DragEvent, ReactNode } from 'react'
import type { ListView } from '~/components/app-shell'
import type { Display } from '~/components/display-options'
import type { Route, Status } from '~/lib/status'
import { useStablePaginatedQuery } from '~/hooks/use-stable-paginated-query'
import { api } from '~/lib/api'
import { LABELS, ROUTES, StatusIcon, labelMeta } from '~/lib/status'
import { SNOOZE_OPTIONS } from '~/components/status-menu'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Pill, shortDate } from '~/components/message-list'

// A column reads either one Jev route (`route`) or one list view (`view`); dropping sets `route` or `status`.
type Column = {
  id: string
  title: string
  icon: ReactNode
  route?: Route | 'reading'
  view?: ListView
  status?: Status
}

const JEV_COLUMNS: Array<Column> = [
  {
    id: 'reading',
    title: 'Reading',
    route: 'reading',
    icon: <ScanText className="size-4 animate-pulse text-muted-foreground" />,
  },
  ...ROUTES.map((r) => ({
    id: `route:${r.id}`,
    title: r.label,
    route: r.id,
    icon: <r.icon className={cn('size-4', r.color)} />,
  })),
]

// The Inbox column is Focus (inbox status, needs you); the noise Jev filed lives under its label.
const STATUS_COLUMNS: Array<Column> = (
  [
    ['focus', 'Inbox', 'inbox'],
    ['in_progress', 'In progress', 'in_progress'],
    ['snoozed', 'Snoozed', 'snoozed'],
    ['done', 'Done', 'done'],
    ['cancelled', 'Cancelled', 'cancelled'],
  ] as const
).map(([view, title, status]) => ({ id: view, view, title, status, icon: <StatusIcon status={status} /> }))

const LABEL_COLUMNS: Array<Column> = LABELS.filter((l) => l.id !== 'junk').map((l) => ({
  id: l.id,
  view: l.id,
  title: l.label,
  icon: <span className={cn('size-2 rounded-full', l.dot)} />,
}))

const COLUMNS: Record<Display['groupBy'], Array<Column>> = {
  jev: JEV_COLUMNS,
  status: STATUS_COLUMNS,
  label: LABEL_COLUMNS,
}

const DRAG_TYPE = 'application/x-email-bro-message'
// Cards Jev sorted this recently slide into their column.
const JUST_SORTED_MS = 10_000
// Below this share for its top route, Jev wasn't sure; the card asks to be checked.
const UNSURE = 0.6

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
  const columns = COLUMNS[display.groupBy]
  const { results: goals } = usePaginatedQuery(api.goals.list, {}, { initialNumItems: 20 })
  const isHidden = (c: Column) => display.hiddenColumns.includes(c.id)
  const hidden = columns.filter(isHidden)
  const hide = (id: string) => onDisplayChange({ hiddenColumns: [...display.hiddenColumns, id] })
  const show = (id: string) => onDisplayChange({ hiddenColumns: display.hiddenColumns.filter((h) => h !== id) })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {display.groupBy === 'jev' && <JevBar />}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {columns
          .filter((c) => !isHidden(c))
          .map((c) => (
            <BoardColumn
              key={c.id}
              column={c}
              inbox={inbox}
              display={display}
              goals={goals}
              selectedId={selectedId}
              onHide={() => hide(c.id)}
            />
          ))}
        {hidden.length > 0 && <HiddenColumns columns={hidden} onShow={show} />}
      </div>
    </div>
  )
}

// Shows the flow the board follows, and re-runs it on existing mail.
const JevBar = () => {
  const resortAll = useMutation(api.messages.resortAll)
  const pauseResort = useMutation(api.messages.pauseResort)
  const resumeResort = useMutation(api.messages.resumeResort)
  const retryFailedTriage = useMutation(api.messages.retryFailedTriage)
  const worker = useQuery(api.messages.resortStatus)
  const [retried, setRetried] = useState<number | null>(null)
  const running = worker?.kind === 'running'
  const paused = worker?.kind === 'stopped'

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-xs text-muted-foreground">
      <ScanText className="size-3.5" />
      <span>Jev reads each email as clean text, then moves it to</span>
      {ROUTES.map((r, i) => (
        <span key={r.id} className="flex items-center gap-1" title={r.hint}>
          <r.icon className={cn('size-3.5', r.color)} />
          <span className="text-foreground">{r.label}</span>
          {i < ROUTES.length - 1 && <span>·</span>}
        </span>
      ))}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={async () => setRetried(await retryFailedTriage())}
          title="Run Jev again on emails it couldn't read"
        >
          <RotateCcw /> {retried === null ? 'Retry failed' : `Retrying ${retried}`}
        </Button>
        {(running || paused) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void (running ? pauseResort() : resumeResort())}
          >
            {running ? <Pause /> : <Play />} {running ? 'Pause re-sort' : 'Resume re-sort'}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={running} onClick={() => void resortAll()}>
          <RefreshCw className={cn(running && 'animate-spin')} />
          {running ? 'Re-sorting…' : 'Re-sort with Jev'}
        </Button>
      </div>
    </div>
  )
}

// Dropping a card on a column (visible or hidden) moves the email there: a new route or a new status.
const useColumnDrop = (column: Column) => {
  const setStatus = useMutation(api.messages.setStatus)
  const setRoute = useMutation(api.messages.setRoute)
  const snooze = useMutation(api.messages.snooze)
  const [over, setOver] = useState(false)
  const route = column.route === 'reading' ? undefined : column.route
  const droppable = !!route || !!column.status
  return {
    over,
    droppable,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!droppable || !e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        const messageId = e.dataTransfer.getData(DRAG_TYPE) as Id<'messages'>
        if (!messageId) return
        if (route) void setRoute({ messageId, route })
        else if (column.status === 'snoozed') void snooze({ messageId, until: SNOOZE_OPTIONS[1].until() })
        else if (column.status && column.status !== 'spam') void setStatus({ messageId, status: column.status })
      },
    },
  }
}

const BoardColumn = ({
  column,
  inbox,
  display,
  goals,
  selectedId,
  onHide,
}: {
  column: Column
  inbox?: Id<'mailboxes'>
  display: Display
  goals: Array<Doc<'goals'>>
  selectedId?: Id<'messages'>
  onHide: () => void
}) => {
  const byRoute = useStablePaginatedQuery(
    api.messages.byRoute,
    column.route ? { route: column.route, mailboxId: inbox } : 'skip',
    { initialNumItems: 25 },
  )
  const byView = useStablePaginatedQuery(
    api.messages.list,
    column.view ? { view: column.view, mailboxId: inbox } : 'skip',
    { initialNumItems: 25 },
  )
  const { results, status, loadMore } = column.route ? byRoute : byView
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
            goal={goals.find((g) => g._id === m.goalId)}
            selected={m._id === selectedId}
            draggable={droppable || column.route === 'reading'}
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
const HiddenColumns = ({ columns, onShow }: { columns: Array<Column>; onShow: (id: string) => void }) => {
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
      {open && columns.map((c) => <HiddenColumn key={c.id} column={c} onShow={() => onShow(c.id)} />)}
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
  goal,
  selected,
  draggable,
}: {
  m: Doc<'messages'>
  display: Display
  column: Column
  goal?: Doc<'goals'>
  selected: boolean
  draggable: boolean
}) => {
  const label = display.labels && m.category && m.category !== column.view ? labelMeta(m.category) : undefined
  const reading = column.route === 'reading'
  const top = m.jev ? Math.max(...Object.values(m.jev.routeProbabilities)) : 1
  const justSorted = !!m.jev && Date.now() - m.jev.sortedAt < JUST_SORTED_MS && column.route !== undefined

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
        'relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-md border bg-card p-2.5 text-[13px] shadow-xs hover:border-ring/40',
        selected && 'border-ring/60',
        justSorted && 'animate-in duration-500 fade-in slide-in-from-left-6 border-ring/50',
      )}
    >
      {reading && (
        <span className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-linear-to-r from-transparent via-ring to-transparent" />
      )}
      <div className="flex items-center gap-2">
        {display.groupBy !== 'status' && <StatusIcon status={m.status} />}
        <span className={cn('min-w-0 flex-1 truncate text-xs', m.read ? 'text-muted-foreground' : 'font-semibold')}>
          {m.fromName}
        </span>
        {display.dates && <time className="shrink-0 text-xs text-muted-foreground">{shortDate(m.receivedAt)}</time>}
      </div>
      <span className={cn('line-clamp-2', !m.read && 'font-medium')}>{m.subject}</span>
      {reading ? (
        <span className="text-xs text-muted-foreground">Jev is reading…</span>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">
          {goal && <Pill className="text-emerald-500">{goal.title}</Pill>}
          {m.jev && m.jev.urgency >= 1.5 && (
            <Pill className="text-amber-500">
              <Clock className="size-3" /> Today
            </Pill>
          )}
          {m.triageFailed && <Pill className="text-red-500">Couldn't read</Pill>}
          {top < UNSURE && (
            <Pill className="border-dashed" title={`Jev was ${Math.round(top * 100)}% sure; drag it if it's wrong`}>
              <HelpCircle className="size-3" /> Check me
            </Pill>
          )}
          {label && (
            <Pill>
              <span className={cn('size-1.5 rounded-full', label.dot)} />
              {label.label}
            </Pill>
          )}
        </div>
      )}
    </Link>
  )
}
