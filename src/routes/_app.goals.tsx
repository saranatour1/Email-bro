import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { usePaginatedQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { RefreshCw, Target, Trash2 } from 'lucide-react'
import { api } from '~/lib/api'
import { cn } from '~/lib/utils'
import { Page } from '~/components/app-shell'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'

const Goals = () => {
  const { results: goals, status } = usePaginatedQuery(api.goals.list, {}, { initialNumItems: 20 })
  const setActive = useMutation(api.goals.setActive)
  const remove = useMutation(api.goals.remove)
  const resortAll = useMutation(api.messages.resortAll)
  const [resorting, setResorting] = useState(false)

  return (
    <Page
      title="goals"
      count={goals.length}
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={resorting}
          onClick={async () => {
            setResorting(true)
            await resortAll()
          }}
        >
          <RefreshCw className={cn(resorting && 'animate-spin')} />
          {resorting ? 'Re-sorting…' : 'Re-sort with Jev'}
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Tell Jev what you're working towards. Email that moves an active goal forward goes to the Goal column and stays
        in Focus. New mail uses your goals right away; re-sort to apply them to mail you already have.
      </p>

      {status !== 'LoadingFirstPage' && goals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white">
            <Target className="size-5" />
          </span>
          <p className="font-medium">No goals yet.</p>
          <p className="text-sm text-muted-foreground">Add one, like "Find a new job" or "Close the Acme deal".</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map((g) => (
            <li
              key={g._id}
              className={cn('flex items-start gap-3 rounded-lg border bg-card p-3', !g.active && 'opacity-60')}
            >
              <Target className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{g.title}</p>
                {g.details && <p className="text-sm text-muted-foreground">{g.details}</p>}
              </div>
              <Switch
                checked={g.active}
                onCheckedChange={(active) => void setActive({ goalId: g._id, active })}
                aria-label={`${g.active ? 'Pause' : 'Resume'} ${g.title}`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label={`Delete ${g.title}`}
                onClick={() => void remove({ goalId: g._id })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <NewGoal />
    </Page>
  )
}

const NewGoal = () => {
  const create = useMutation(api.goals.create)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">New goal</CardTitle>
        <CardDescription>Details help Jev tell related mail apart: names, companies, projects.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              await create({ title, details })
              setTitle('')
              setDetails('')
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : 'Could not save the goal')
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-title">Goal</Label>
            <Input
              id="goal-title"
              required
              placeholder="Find a new job"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-details">Details (optional)</Label>
            <Textarea
              id="goal-details"
              rows={2}
              placeholder="Senior frontend roles; recruiters, interview invites, offers"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="self-start">
            Add goal
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute('/_app/goals')({ component: Goals })
