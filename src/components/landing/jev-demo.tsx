import { useState } from 'react'
import { ListFilter } from 'lucide-react'
import type { Category, Route } from '~/lib/status'
import { ROUTES, labelMeta, routeMeta } from '~/lib/status'
import { cn } from '~/lib/utils'

type Example = {
  from: string
  time: string
  subject: string
  preview: string
  route: Route
  probabilities: Partial<Record<Route, number>>
  // Left out when a filter decided and Jev wasn't asked.
  urgency?: number
  category: Category
  confidence: number
  matches: Array<{ kind: string; text: string }>
  filter?: boolean
  outcome: string
  outcomeText: string
}

// Made-up emails and scores, shaped like what `classify` returns.
const EXAMPLES: Array<Example> = [
  {
    from: 'Maya Chen',
    time: '9:41',
    subject: 'Lease renewal: can you sign by Friday?',
    preview: 'Hi, the landlord sent the new lease. I signed my part, could you add yours before Friday?',
    route: 'action',
    probabilities: { action: 0.91, goal: 0.02, info: 0.06, spam: 0.01 },
    urgency: 0.64,
    category: 'people',
    confidence: 0.93,
    matches: [{ kind: 'label', text: 'Home, because Jev said yes to "Rent, lease, utilities and repairs"' }],
    outcome: 'Focus',
    outcomeText: 'Stays in your inbox, at the top of Focus.',
  },
  {
    from: 'Northwind Talent',
    time: '8:15',
    subject: 'Next steps for the Senior Frontend role',
    preview: 'Thanks for your time on Tuesday. The team would like to invite you to a final round next week.',
    route: 'goal',
    probabilities: { action: 0.22, goal: 0.74, info: 0.03, spam: 0.01 },
    urgency: 0.58,
    category: 'people',
    confidence: 0.81,
    matches: [
      { kind: 'goal', text: 'Find a new job' },
      { kind: 'workflow', text: 'Job applications: yes at 0.94, so it moves to In progress' },
    ],
    outcome: 'In progress',
    outcomeText: 'Moved by your Job applications workflow, and still in Focus.',
  },
  {
    from: 'Frontend Digest',
    time: '7:02',
    subject: 'Issue 212: signals, streams and sync engines',
    preview: 'This week: why sync engines are back, a deep dive on fine-grained reactivity, and three talks.',
    route: 'info',
    probabilities: { action: 0.01, goal: 0.04, info: 0.93, spam: 0.02 },
    urgency: 0.05,
    category: 'newsletters',
    confidence: 0.96,
    matches: [],
    outcome: 'Filed under Info',
    outcomeText: 'Kept out of Focus, archived and labelled in Gmail. Never deleted.',
  },
  {
    from: 'Derek at LeadLoop',
    time: 'Yesterday',
    subject: 'Quick question about your pipeline',
    preview: 'Hey, noticed your team is growing fast. Would you be open to a 15 minute call about outbound?',
    route: 'spam',
    probabilities: { action: 0.06, goal: 0.01, info: 0.05, spam: 0.88 },
    urgency: 0.08,
    category: 'junk',
    confidence: 0.9,
    matches: [],
    outcome: 'Spam',
    outcomeText: 'Archived as spam. Still there if you ever need it.',
  },
  {
    from: 'Acme Bank',
    time: 'Yesterday',
    subject: 'Your November statement is ready',
    preview: 'Your statement for the account ending in 4821 is now available in online banking.',
    route: 'info',
    probabilities: { info: 1 },
    category: 'updates',
    confidence: 1,
    filter: true,
    matches: [{ kind: 'filter', text: 'Bank statements: from acmebank.com|statements@, subject statement|balance' }],
    outcome: 'Done',
    outcomeText: 'Your filter filed it as Info, labelled it Updates and marked it Done.',
  },
]

const URGENCY = ['Can wait', 'In the next few days', 'Needs attention today']

// The "pick an email" demo: one example email and Jev's answers to it.
export const JevDemo = ({ onPick }: { onPick: () => void }) => {
  const [picked, setPicked] = useState(0)
  const email = EXAMPLES[picked]
  const level = email.urgency === undefined ? -1 : Math.min(2, Math.floor(email.urgency * 3))
  const kind = labelMeta(email.category)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1 rounded-xl bg-muted p-1.5">
          {EXAMPLES.map((e, i) => (
            <button
              key={e.subject}
              type="button"
              aria-pressed={i === picked}
              onClick={() => {
                setPicked(i)
                onPick()
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                i === picked ? 'border-ring bg-card shadow-xs' : 'border-transparent hover:bg-card/60',
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-[13px] font-bold">
                {e.from[0]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{e.from}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{e.time}</span>
                </span>
                <span className="truncate text-[13px] text-muted-foreground">{e.subject}</span>
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('size-1.5 rounded-full bg-current', routeMeta(e.route).color)} />
                  {e.filter ? 'Info, by your filter' : routeMeta(e.route).label}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-[999_1_34rem] overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col gap-1 border-b px-5 py-4">
            <p className="text-[13px] text-muted-foreground">
              From <span className="font-semibold text-foreground">{email.from}</span> · {email.time}
            </p>
            <p className="font-heading text-lg font-semibold">{email.subject}</p>
            <p className="text-sm text-muted-foreground">{email.preview}</p>
          </div>
          {email.filter && (
            <p className="flex items-center gap-2.5 border-b bg-accent px-5 py-2.5 text-sm">
              <ListFilter className="size-4 shrink-0" />A filter of yours matched first and set both the column and the
              label, so Jev was not asked.
            </p>
          )}
          <div className="flex flex-col gap-6 px-5 py-5">
            <div className="flex flex-col gap-2.5">
              <Question title="Where does it belong?" kind="route · choice" />
              {ROUTES.map((r) => {
                const p = email.probabilities[r.id] ?? 0
                const top = r.id === email.route
                return (
                  <div key={r.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                    <span className={cn('text-[13px]', top ? 'font-semibold' : 'text-muted-foreground')}>
                      {r.label}
                    </span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-2 rounded-full bg-current transition-[width] duration-500',
                          top ? r.color : 'text-muted-foreground/40',
                        )}
                        style={{ width: `${p * 100}%` }}
                      />
                    </div>
                    <span className={cn('text-right font-mono text-xs', !top && 'text-muted-foreground')}>
                      {p.toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-x-7 gap-y-6">
              <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-2.5">
                <Question title="How soon?" kind="urgency · score" />
                <div className="flex gap-1">
                  {URGENCY.map((u, i) => (
                    <div key={u} className={cn('h-2 flex-1 rounded-sm', i <= level ? 'bg-foreground' : 'bg-muted')} />
                  ))}
                </div>
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="font-medium">{level < 0 ? 'Not asked' : URGENCY[level]}</span>
                  <span className="font-mono text-xs text-muted-foreground">{email.urgency?.toFixed(2) ?? 'n/a'}</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-2.5">
                <Question title="What kind is it?" kind="category · choice" />
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
                    <span className={cn('size-2 rounded-full', kind.dot)} />
                    {kind.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{email.confidence.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Question title="Your goals, workflows, labels and filters" kind="yes / no each" />
              {email.matches.map((m) => (
                <p key={m.text} className="flex items-baseline gap-2.5 text-sm">
                  <span className="min-w-16 shrink-0 rounded bg-muted px-2 text-center font-mono text-[11px]">
                    {m.kind}
                  </span>
                  {m.text}
                </p>
              ))}
              {!email.matches.length && (
                <p className="text-sm text-muted-foreground">Nothing of yours matched, so Jev's own call stands.</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 bg-primary px-5 py-4 text-primary-foreground">
            <span className="inline-flex items-center gap-2 font-heading font-semibold">
              <span className={cn('size-2 rounded-full bg-current', routeMeta(email.route).color)} />
              {email.outcome}
            </span>
            <span className="text-sm opacity-80">{email.outcomeText}</span>
          </div>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Example emails and scores. Jev returns raw probabilities; the thresholds live in code, so changing a rule never
        means asking again.
      </p>
    </div>
  )
}

const Question = ({ title, kind }: { title: string; kind: string }) => (
  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <span className="text-[15px] font-semibold">{title}</span>
    <span className="font-mono text-xs text-muted-foreground">{kind}</span>
  </p>
)
