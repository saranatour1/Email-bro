import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, usePaginatedQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Plus, Sparkles, Trash2, Workflow } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { Status } from '~/lib/status'
import { api } from '~/lib/api'
import { StatusIcon } from '~/lib/status'
import { PageHeader } from '~/components/app-shell'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'

type Action = Doc<'jevWorkflows'>['action']

const ACTIONS: Array<{ id: Action; label: string; status: Status }> = [
  { id: 'focus', label: 'Keep in Focus', status: 'inbox' },
  { id: 'in_progress', label: 'Move to In progress', status: 'in_progress' },
  { id: 'done', label: 'Mark Done', status: 'done' },
  { id: 'cancelled', label: 'Mark Cancelled', status: 'cancelled' },
  { id: 'spam', label: 'Move to Spam', status: 'spam' },
]

const actionMeta = (id: Action) => ACTIONS.find((a) => a.id === id) ?? ACTIONS[0]

const Workflows = () => {
  const { results: workflows, status } = usePaginatedQuery(api.workflows.list, {}, { initialNumItems: 50 })
  const { results: mailboxes } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const setEnabled = useMutation(api.workflows.setEnabled)
  const remove = useMutation(api.workflows.remove)
  const addressOf = (id?: Id<'mailboxes'>) => (id ? mailboxes.find((m) => m._id === id)?.address : 'All inboxes')

  return (
    <>
      <PageHeader>
        <h1 className="font-mono text-sm">workflows</h1>
        <span className="text-sm text-muted-foreground">{workflows.length}</span>
      </PageHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
          <p className="text-sm text-muted-foreground">
            Jev checks every enabled workflow as new mail arrives, in the same pass that sorts it. The first workflow it
            is sure about wins. Mail that's already sorted isn't changed.
          </p>

          {status !== 'LoadingFirstPage' && workflows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white">
                <Workflow className="size-5" />
              </span>
              <p className="font-medium">No workflows yet.</p>
              <p className="text-sm text-muted-foreground">
                Describe a kind of email in plain words and choose where it goes.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr className="[&>th]:border-b [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
                    <th>name</th>
                    <th>when jev decides</th>
                    <th>then</th>
                    <th>inbox</th>
                    <th>on</th>
                    <th>
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((w) => (
                    <tr
                      key={w._id}
                      className="align-top [&>td]:border-b [&>td]:px-3 [&>td]:py-2.5 last:[&>td]:border-b-0"
                    >
                      <td className="font-medium">{w.name}</td>
                      <td className="max-w-80 text-muted-foreground">{w.condition}</td>
                      <td>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <StatusIcon status={actionMeta(w.action).status} />
                          {actionMeta(w.action).label}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-muted-foreground">{addressOf(w.mailboxId)}</td>
                      <td>
                        <Switch
                          checked={w.enabled}
                          onCheckedChange={(enabled) => void setEnabled({ workflowId: w._id, enabled })}
                          aria-label={`${w.enabled ? 'Disable' : 'Enable'} ${w.name}`}
                        />
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          aria-label={`Delete ${w.name}`}
                          onClick={() => void remove({ workflowId: w._id })}
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

          <Suggestions />
          <NewWorkflow mailboxes={mailboxes} />
        </div>
      </ScrollArea>
    </>
  )
}

type Suggestion = FunctionReturnType<typeof api.workflows.suggest>[number]

const Suggestions = () => {
  const suggest = useAction(api.workflows.suggest)
  const create = useMutation(api.workflows.create)
  const [suggestions, setSuggestions] = useState<Array<Suggestion> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setSuggestions(await suggest({}))
    } catch {
      setError('Could not get suggestions')
    } finally {
      setLoading(false)
    }
  }

  const add = async (s: Suggestion) => {
    try {
      await create({ name: s.name, condition: s.condition, action: s.action })
      setSuggestions((all) => all?.filter((x) => x !== s) ?? null)
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : 'Could not save the workflow')
    }
  }

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-sm">Suggested for you</CardTitle>
          <CardDescription>Ideas from who writes to you and what you do with their mail.</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <Sparkles />
          {loading ? 'Thinking…' : suggestions ? 'Refresh' : 'Suggest'}
        </Button>
      </CardHeader>
      {(suggestions || error) && (
        <CardContent className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {suggestions?.length === 0 && <p className="text-sm text-muted-foreground">Nothing to suggest yet.</p>}
          {suggestions?.map((s) => (
            <div key={s.name + s.condition} className="flex items-start gap-3 rounded-md border p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <StatusIcon status={actionMeta(s.action).status} />
                    {actionMeta(s.action).label}
                  </span>
                </div>
                <p className="text-sm">{s.condition}</p>
                <p className="text-xs text-muted-foreground">{s.why}</p>
              </div>
              <Button size="sm" variant="ghost" aria-label={`Add ${s.name}`} onClick={() => void add(s)}>
                <Plus />
                Add
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}

const ALL = 'all'

const NewWorkflow = ({ mailboxes }: { mailboxes: Array<Doc<'mailboxes'>> }) => {
  const create = useMutation(api.workflows.create)
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('')
  const [action, setAction] = useState<Action>('in_progress')
  const [inbox, setInbox] = useState<string>(ALL)
  const [error, setError] = useState<string | null>(null)

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">New workflow</CardTitle>
        <CardDescription>Write the condition as a yes-or-no question about the email.</CardDescription>
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
                condition,
                action,
                mailboxId: inbox === ALL ? undefined : (inbox as Id<'mailboxes'>),
              })
              setName('')
              setCondition('')
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : 'Could not save the workflow')
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              required
              placeholder="Job applications"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wf-inbox">Inbox</Label>
            <Select value={inbox} onValueChange={setInbox}>
              <SelectTrigger id="wf-inbox" className="w-full">
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
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="wf-condition">When Jev decides…</Label>
            <Textarea
              id="wf-condition"
              required
              rows={2}
              placeholder="Is this a reply from a company about a job I applied to?"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wf-action">Then</Label>
            <Select value={action} onValueChange={(v) => setAction(v as Action)}>
              <SelectTrigger id="wf-action" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <StatusIcon status={a.status} /> {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit">Add workflow</Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute('/_app/workflows')({ component: Workflows })
