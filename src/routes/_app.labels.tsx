import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { Pencil, Tag, Trash2 } from 'lucide-react'
import type { Doc } from '../../convex/_generated/dataModel'
import type { LabelColor } from '~/lib/labels'
import { api } from '~/lib/api'
import { LABEL_COLORS } from '~/lib/labels'
import { cn } from '~/lib/utils'
import { Page } from '~/components/app-shell'
import { LabelDot } from '~/components/labels'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'

const Labels = () => {
  const labels = useQuery(api.labels.list, {})
  const remove = useMutation(api.labels.remove)
  const [editing, setEditing] = useState<Doc<'labels'> | null>(null)

  return (
    <Page title="labels" count={labels?.length ?? 0}>
      <p className="text-sm text-muted-foreground">
        Your own labels for mail. Email Bro adds them as new mail is sorted: by who sent it, or when Jev decides the
        email fits a label's description. You can also add them by hand from an open email. They show in Gmail under the
        same names.
      </p>

      {labels?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white">
            <Tag className="size-5" />
          </span>
          <p className="font-medium">No labels yet.</p>
          <p className="text-sm text-muted-foreground">Make one for a client, a project or a kind of email.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr className="[&>th]:border-b [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
                <th>name</th>
                <th>from</th>
                <th>when jev decides</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {labels?.map((l) => (
                <tr key={l._id} className="align-top [&>td]:border-b [&>td]:px-3 [&>td]:py-2.5 last:[&>td]:border-b-0">
                  <td>
                    <span className="flex items-center gap-2 font-medium">
                      <LabelDot label={l} />
                      {l.name}
                    </span>
                  </td>
                  <td className="max-w-64 font-mono text-xs text-muted-foreground">{l.senders ?? '—'}</td>
                  <td className="max-w-80 text-muted-foreground">{l.description ?? '—'}</td>
                  <td>
                    <span className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={`Edit ${l.name}`}
                        onClick={() => setEditing(l)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={`Delete ${l.name}`}
                        onClick={() => {
                          if (editing?._id === l._id) setEditing(null)
                          void remove({ labelId: l._id })
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LabelForm key={editing?._id ?? 'new'} editing={editing} onDone={() => setEditing(null)} />
    </Page>
  )
}

const LabelForm = ({ editing, onDone }: { editing: Doc<'labels'> | null; onDone: () => void }) => {
  const create = useMutation(api.labels.create)
  const update = useMutation(api.labels.update)
  const [name, setName] = useState(editing?.name ?? '')
  const [color, setColor] = useState<LabelColor>(editing?.color ?? 'blue')
  const [senders, setSenders] = useState(editing?.senders ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">{editing ? `Edit ${editing.name}` : 'New label'}</CardTitle>
        <CardDescription>
          Fill in who it's from, what it's about, both, or neither to only add it by hand.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              const fields = { name, color, senders, description }
              if (editing) await update({ labelId: editing._id, ...fields })
              else await create(fields)
              setName('')
              setSenders('')
              setDescription('')
              onDone()
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : 'Could not save the label')
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-name">Name</Label>
            <Input
              id="label-name"
              required
              maxLength={40}
              placeholder="Acme"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Color</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.id}
                  aria-pressed={color === c.id}
                  onClick={() => setColor(c.id)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md border border-transparent hover:bg-accent',
                    color === c.id && 'border-ring/60 bg-accent',
                  )}
                >
                  <span className={cn('size-3 rounded-full', c.dot)} />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="label-senders">From</Label>
            <Input
              id="label-senders"
              className="font-mono"
              placeholder="jane@acme.com | acme.com"
              value={senders}
              onChange={(e) => setSenders(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              People or domains, with | between them. Mail from any of them gets the label.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="label-description">When Jev decides it's about…</Label>
            <Textarea
              id="label-description"
              rows={2}
              placeholder="Invoices, quotes and payment reminders"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Button type="submit">{editing ? 'Save label' : 'Add label'}</Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            )}
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

export const Route = createFileRoute('/_app/labels')({ component: Labels })
