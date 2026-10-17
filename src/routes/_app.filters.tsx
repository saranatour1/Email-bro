import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { usePaginatedQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { ListFilter, Plus, Trash2 } from 'lucide-react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { Category, Route as JevRoute } from '~/lib/status'
import { api } from '~/lib/api'
import { LABELS, ROUTES, StatusIcon, labelMeta, routeMeta } from '~/lib/status'
import { cn } from '~/lib/utils'
import { Page } from '~/components/app-shell'
import { Pill } from '~/components/message-list'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'

type Filter = Doc<'filters'>
type FilterStatus = NonNullable<Filter['status']>
type Rule = Pick<Filter, 'name' | 'from' | 'subject' | 'route' | 'label' | 'status' | 'markRead'> & { hint: string }

const STATUS_LABEL: Record<FilterStatus, string> = { in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' }

// Common Gmail-style rules, ready to add in one click.
const TEMPLATES: Array<Rule> = [
  {
    name: 'Receipts & orders',
    subject: 'receipt|invoice|order confirmation|your order',
    route: 'info',
    label: 'updates',
    markRead: true,
    hint: 'Info, Updates, mark read',
  },
  {
    name: 'Security alerts',
    subject: 'security alert|new sign-in|password reset|verification code',
    route: 'action',
    label: 'updates',
    hint: 'Needs action, Updates',
  },
  {
    name: 'Calendar invites',
    subject: 'invitation:|updated invitation|accepted:|declined:',
    route: 'action',
    label: 'notifications',
    hint: 'Needs action, Notifications',
  },
  {
    name: 'Social notifications',
    from: 'linkedin.com|facebookmail.com|@x.com|instagram.com|tiktok.com',
    route: 'info',
    label: 'notifications',
    status: 'done',
    hint: 'Info, Notifications, Done',
  },
  { name: 'GitHub', from: 'github.com', route: 'info', label: 'notifications', hint: 'Info, Notifications' },
  { name: 'No-reply senders', from: 'noreply|no-reply|donotreply', route: 'info', hint: 'Info; Jev still labels it' },
]

const NONE = 'none'
const ALL = 'all'

const Filters = () => {
  const { results: filters, status } = usePaginatedQuery(api.filters.list, {}, { initialNumItems: 50 })
  const { results: mailboxes } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const create = useMutation(api.filters.create)
  const setEnabled = useMutation(api.filters.setEnabled)
  const remove = useMutation(api.filters.remove)
  const addressOf = (id?: Id<'mailboxes'>) => (id ? mailboxes.find((m) => m._id === id)?.address : 'All inboxes')
  const added = new Set(filters.map((f) => f.name))

  return (
    <Page title="filters" count={filters.length}>
      <p className="text-sm text-muted-foreground">
        Exact rules, like Gmail filters: they match the sender and subject before Jev reads the email. The first
        matching filter wins. A filter that sets both a column and a label sorts the email without asking Jev. Use{' '}
        <code className="font-mono">|</code> for "or".
      </p>

      {status !== 'LoadingFirstPage' && filters.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white">
            <ListFilter className="size-5" />
          </span>
          <p className="font-medium">No filters yet.</p>
          <p className="text-sm text-muted-foreground">Start from a template below, or create your own.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr className="[&>th]:border-b [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
                <th className="w-36">name</th>
                <th>matches</th>
                <th className="w-48">then</th>
                <th className="w-32">inbox</th>
                <th className="w-12">on</th>
                <th className="w-10">
                  <span className="sr-only">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filters.map((f) => (
                <tr key={f._id} className="align-top [&>td]:border-b [&>td]:px-3 [&>td]:py-2.5 last:[&>td]:border-b-0">
                  <td className="font-medium">{f.name}</td>
                  <td>
                    <div className="flex flex-col gap-1.5">
                      {f.from && <Pattern field="from" value={f.from} />}
                      {f.subject && <Pattern field="subject" value={f.subject} />}
                    </div>
                  </td>
                  <td>
                    <Actions rule={f} />
                  </td>
                  <td className="truncate font-mono text-xs text-muted-foreground" title={addressOf(f.mailboxId)}>
                    {addressOf(f.mailboxId)}
                  </td>
                  <td>
                    <Switch
                      checked={f.enabled}
                      onCheckedChange={(enabled) => void setEnabled({ filterId: f._id, enabled })}
                      aria-label={`${f.enabled ? 'Disable' : 'Enable'} ${f.name}`}
                    />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      aria-label={`Delete ${f.name}`}
                      onClick={() => void remove({ filterId: f._id })}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Templates</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map(({ hint, ...rule }) => (
            <div key={rule.name} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{rule.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7"
                  disabled={added.has(rule.name)}
                  onClick={() => void create(rule)}
                >
                  <Plus /> {added.has(rule.name) ? 'Added' : 'Add'}
                </Button>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {rule.from ? `from: ${rule.from}` : `subject: ${rule.subject}`}
              </p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>
      </section>

      <NewFilter mailboxes={mailboxes} />
    </Page>
  )
}

// One chip per `|` alternative, so long rules wrap instead of running into the next column.
const Pattern = ({ field, value }: { field: string; value: string }) => (
  <div className="flex flex-wrap items-center gap-1">
    <span className="text-xs text-muted-foreground">{field}</span>
    {value
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => (
        <code key={p} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] break-all">
          {p}
        </code>
      ))}
  </div>
)

const Actions = ({ rule }: { rule: Pick<Filter, 'route' | 'label' | 'status' | 'markRead'> }) => {
  const route = rule.route ? routeMeta(rule.route) : undefined
  const label = rule.label ? labelMeta(rule.label) : undefined
  return (
    <div className="flex flex-wrap gap-1">
      {route && (
        <Pill className={route.color}>
          <route.icon className="size-3" /> {route.label}
        </Pill>
      )}
      {label && (
        <Pill>
          <span className={cn('size-1.5 rounded-full', label.dot)} />
          {label.label}
        </Pill>
      )}
      {rule.status && (
        <Pill>
          <StatusIcon status={rule.status} /> {STATUS_LABEL[rule.status]}
        </Pill>
      )}
      {rule.markRead && <Pill>Mark read</Pill>}
    </div>
  )
}

const NewFilter = ({ mailboxes }: { mailboxes: Array<Doc<'mailboxes'>> }) => {
  const create = useMutation(api.filters.create)
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [inbox, setInbox] = useState(ALL)
  const [route, setRoute] = useState(NONE)
  const [label, setLabel] = useState(NONE)
  const [status, setStatus] = useState(NONE)
  const [markRead, setMarkRead] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (id: string, value: string, onChange: (v: string) => void, options: Array<[string, string]>) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Don't change</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Create filter</CardTitle>
        <CardDescription>Matches are "contains" and ignore case. Every field you fill must match.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              await create({
                name,
                from,
                subject,
                mailboxId: inbox === ALL ? undefined : (inbox as Id<'mailboxes'>),
                route: route === NONE ? undefined : (route as JevRoute),
                label: label === NONE ? undefined : (label as Category),
                status: status === NONE ? undefined : (status as FilterStatus),
                markRead: markRead || undefined,
              })
              setName('')
              setFrom('')
              setSubject('')
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : 'Could not save the filter')
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-name">Name</Label>
            <Input
              id="f-name"
              required
              placeholder="Bank statements"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-inbox">Inbox</Label>
            <Select value={inbox} onValueChange={setInbox}>
              <SelectTrigger id="f-inbox" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All inboxes</SelectItem>
                {mailboxes.map((m) => (
                  <SelectItem key={m._id} value={m._id}>
                    {m.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-from">From contains</Label>
            <Input
              id="f-from"
              placeholder="mybank.com|statements@"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-subject">Subject contains</Label>
            <Input
              id="f-subject"
              placeholder="statement|balance"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-route">Move to column</Label>
            {pick(
              'f-route',
              route,
              setRoute,
              ROUTES.map((r) => [r.id, r.label]),
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-label">Apply label</Label>
            {pick(
              'f-label',
              label,
              setLabel,
              LABELS.map((l) => [l.id, l.label]),
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-status">Set status</Label>
            {pick('f-status', status, setStatus, Object.entries(STATUS_LABEL))}
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Switch id="f-read" checked={markRead} onCheckedChange={setMarkRead} />
            <Label htmlFor="f-read">Mark as read</Label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {error}
            </p>
          )}
          <Button type="submit" className="self-start">
            Create filter
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute('/_app/filters')({ component: Filters })
