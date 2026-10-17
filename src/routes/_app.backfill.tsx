import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { ArrowRight, DatabaseZap, Inbox, Layers, Pause, Play, RotateCcw, ScanText, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { api } from '~/lib/api'
import { LABELS, ROUTES } from '~/lib/status'
import { cn } from '~/lib/utils'
import { PageHeader } from '~/components/app-shell'
import { Button } from '~/components/ui/button'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

type Event = Doc<'pipelineEvents'>
type Counts = Record<string, number>

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '0', label: 'Everything' },
]

const Backfill = () => {
  const status = useQuery(api.backfill.status)
  const runId = status?.run._id
  const events = usePaginatedQuery(api.backfill.events, runId ? { runId } : 'skip', { initialNumItems: 120 })

  return (
    <>
      <RunControls
        running={status?.worker?.kind === 'running'}
        sorting={!!status && status.counts.sorted < status.counts.fetched}
        run={status?.run}
        failed={status?.counts.failed ?? 0}
      />
      <div className="flex min-h-0 flex-1">
        <ScrollArea className="min-h-0 flex-1">
          {status ? (
            <div className="flex flex-col gap-6 p-6">
              <Flow counts={status.counts} running={status.worker?.kind === 'running'} />
              <Lanes routes={status.routes} events={events.results} />
              <Labels labels={status.labels} />
            </div>
          ) : (
            <EmptyState />
          )}
        </ScrollArea>
        <aside className="flex w-[26rem] shrink-0 flex-col border-l">
          <LiveLog events={events.results} startedAt={status?.run.startedAt} sorted={status?.counts.sorted ?? 0} />
          {runId && <Study runId={runId} />}
        </aside>
      </div>
    </>
  )
}

const RunControls = ({
  running,
  sorting,
  run,
  failed,
}: {
  running: boolean
  sorting: boolean
  run?: Doc<'backfillRuns'>
  failed: number
}) => {
  const { results: mailboxes } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const startRun = useMutation(api.backfill.startRun)
  const pauseRun = useMutation(api.backfill.pauseRun)
  const resumeRun = useMutation(api.backfill.resumeRun)
  const retryRun = useMutation(api.backfill.retryRun)
  const canRetry = failed > 0 || (run?.pending ?? []).some((p) => p.reason === 'failed')
  const [mailbox, setMailbox] = useState('all')
  const [days, setDays] = useState('30')
  const [error, setError] = useState<string | null>(null)
  const gmail = mailboxes.filter((m) => m.provider === 'gmail')

  return (
    <PageHeader>
      <h1 className="font-mono text-sm">backfill</h1>
      <span
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-xs',
          running ? 'border-emerald-500/50 text-emerald-500' : 'text-muted-foreground',
        )}
      >
        <span className={cn('size-1.5 rounded-full bg-current', running && 'animate-pulse')} />
        worker {running ? 'running' : 'idle'}
      </span>
      {error && <span className="truncate text-xs text-destructive">{error}</span>}
      <div className="ml-auto flex items-center gap-2">
        <Select value={mailbox} onValueChange={setMailbox}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Gmail inboxes</SelectItem>
            {gmail.map((m) => (
              <SelectItem key={m._id} value={m._id}>
                {m.address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {run && !run.paused && (running || sorting) && (
          <Button size="sm" variant="outline" onClick={() => void pauseRun({ runId: run._id })}>
            <Pause /> Pause
          </Button>
        )}
        {run?.paused && (
          <Button size="sm" variant="outline" onClick={() => void resumeRun({ runId: run._id })}>
            <Play /> Resume
          </Button>
        )}
        {run && canRetry && !run.paused && (
          <Button size="sm" variant="outline" onClick={() => void retryRun({ runId: run._id })}>
            <RotateCcw /> Retry failed
          </Button>
        )}
        <Button
          size="sm"
          disabled={running || run?.paused}
          title={running || run?.paused ? 'Pause or finish the current run first' : undefined}
          onClick={async () => {
            setError(null)
            try {
              await startRun({
                mailboxId: mailbox === 'all' ? undefined : (mailbox as Id<'mailboxes'>),
                days: Number(days) || undefined,
              })
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : 'Could not start the backfill')
            }
          }}
        >
          <Play /> Start backfill
        </Button>
      </div>
    </PageHeader>
  )
}

// The pipeline as a row of steps, each with its live count.
const Flow = ({ counts, running }: { counts: Counts; running: boolean }) => {
  const inQueue = Math.max(0, counts.queued + counts.retry - counts.claimed)
  const reading = Math.max(0, counts.fetched - counts.sorted)
  const steps: Array<{ label: string; value: number; hint: string; icon: ReactNode; live?: boolean }> = [
    { label: 'Queued', value: counts.queued, hint: `${inQueue} waiting`, icon: <Inbox /> },
    {
      label: 'Batch worker',
      value: counts.claimed,
      hint: running ? 'taking 10 at a time' : 'idle',
      icon: <Layers />,
      live: running,
    },
    { label: 'Fetched', value: counts.fetched, hint: `${counts.skipped} already had`, icon: <DatabaseZap /> },
    { label: 'Jev reading', value: reading, hint: 'clean Markdown in', icon: <ScanText />, live: reading > 0 },
    {
      label: 'Sorted',
      value: counts.sorted,
      hint: `${counts.failed} failed · ${counts.retry} retried`,
      icon: <Sparkles />,
    },
  ]
  return (
    <section className="flex items-stretch gap-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-center gap-2">
          <div className={cn('flex flex-1 flex-col gap-1 rounded-lg border bg-card p-3', s.live && 'border-ring/50')}>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
              {s.icon} {s.label}
            </span>
            <span className="font-mono text-2xl tabular-nums">{s.value}</span>
            <span className="text-xs text-muted-foreground">{s.hint}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className="size-4 shrink-0 text-muted-foreground" />}
        </div>
      ))}
    </section>
  )
}

// Where Jev is putting the mail, with the latest refs sliding in as they're sorted.
const Lanes = ({ routes, events }: { routes: Counts; events: Array<Event> }) => (
  <section className="grid grid-cols-4 gap-3">
    {ROUTES.map((r) => {
      const recent = events.filter((e) => e.kind === 'sorted' && e.route === r.id).slice(0, 8)
      return (
        <div key={r.id} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm">
            <r.icon className={cn('size-4', r.color)} />
            <span className="font-medium">{r.label}</span>
            <span className="ml-auto font-mono text-muted-foreground tabular-nums">{routes[r.id]}</span>
          </div>
          <ul className="flex flex-col gap-1">
            {recent.map((e) => (
              <li
                key={e._id}
                className="flex animate-in items-center justify-between rounded-md border bg-card px-2 py-1 font-mono text-xs duration-500 fade-in slide-in-from-top-2"
              >
                <span>{e.ref}</span>
                {e.label && <span className="text-muted-foreground">{e.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      )
    })}
  </section>
)

const Labels = ({ labels }: { labels: Counts }) => {
  const total = Math.max(1, ...Object.values(labels))
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">Auto-labeled</h2>
      {LABELS.map((l) => (
        <div key={l.id} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', l.dot)} />
            {l.label}
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full rounded-full transition-[width] duration-500', l.dot)}
              style={{ width: `${(labels[l.id] / total) * 100}%` }}
            />
          </span>
          <span className="text-right font-mono tabular-nums">{labels[l.id]}</span>
        </div>
      ))}
    </section>
  )
}

const KIND_COLOR: Record<Event['kind'], string> = {
  started: 'text-foreground',
  queued: 'text-muted-foreground',
  claimed: 'text-indigo-500',
  skipped: 'text-muted-foreground',
  fetched: 'text-sky-500',
  sorted: 'text-emerald-500',
  retry: 'text-amber-500',
  failed: 'text-red-500',
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
  `.${String(ms % 1000).padStart(3, '0')}`

// Convex-dashboard-style log stream of the run, with live throughput.
const LiveLog = ({ events, startedAt, sorted }: { events: Array<Event>; startedAt?: number; sorted: number }) => {
  const latest = events.at(0)?.at ?? 0
  const lastMinute = events.filter((e) => e.kind === 'sorted' && latest - e.at < 60_000).length
  // The average uses the run's sorted counter, not just the loaded page of events.
  const minutes = startedAt && latest > startedAt ? (latest - startedAt) / 60_000 : 0

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b px-3 text-xs">
        <span className="font-mono text-sm">logs</span>
        <span className="text-muted-foreground">
          <span className="font-mono text-foreground tabular-nums">{lastMinute}</span>/min now
        </span>
        <span className="text-muted-foreground">
          <span className="font-mono text-foreground tabular-nums">{minutes ? Math.round(sorted / minutes) : 0}</span>
          /min avg
        </span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col py-1 font-mono text-[11px] leading-5">
          {events.length === 0 && <li className="px-3 py-2 text-muted-foreground">No run yet.</li>}
          {events.map((e) => (
            <li key={e._id} className="flex animate-in gap-2 px-3 duration-300 fade-in hover:bg-muted/50">
              <span className="text-muted-foreground">{clock(e.at)}</span>
              <span className={cn('w-14 shrink-0', KIND_COLOR[e.kind])}>{e.kind}</span>
              <span className="truncate">
                {e.ref ?? `×${e.count ?? 1}`}
                {e.route && <span className="text-muted-foreground"> → {e.route}</span>}
                {e.label && <span className="text-muted-foreground"> · {e.label}</span>}
              </span>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </section>
  )
}

const Study = ({ runId }: { runId: Id<'backfillRuns'> }) => {
  const study = useAction(api.backfill.study)
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <section className="flex max-h-[45%] shrink-0 flex-col gap-2 border-t p-3">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            setText(await study({ runId }))
          } catch {
            setText("Haiku couldn't study this run. Try again in a moment.")
          } finally {
            setBusy(false)
          }
        }}
      >
        <Sparkles /> {busy ? 'Haiku is studying the run…' : 'Ask Haiku to study this run'}
      </Button>
      {text && (
        <ScrollArea className="min-h-0">
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{text}</p>
        </ScrollArea>
      )}
    </section>
  )
}

const EmptyState = () => (
  <div className="m-6 flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
    <span className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white">
      <DatabaseZap className="size-5" />
    </span>
    <p className="font-medium">No backfill yet.</p>
    <p className="max-w-md text-sm text-muted-foreground">
      Pick an inbox and a range, then start. The batch worker queues every email, Jev reads each one and sorts it, and
      the log on the right streams every step. Emails show only as keyed hashes, never their contents.
    </p>
  </div>
)

export const Route = createFileRoute('/_app/backfill')({ component: Backfill })
