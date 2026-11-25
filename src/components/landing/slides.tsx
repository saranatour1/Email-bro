import { ChevronDown, ListFilter, Pause, RotateCcw, Sparkles, SquareKanban, Tag, Target, Workflow } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Category, Route, Status } from '~/lib/status'
import { Logo } from '~/components/logo'
import { LABELS, ROUTES, StatusIcon, labelMeta, routeMeta } from '~/lib/status'
import { cn } from '~/lib/utils'

// Static mockups of the app for the landing page tour. Every sender, subject and count here is made up.

type Row = { route: Route; from: string; subject: string; preview: string; pill: string; dot: string; time: string }

const FOCUS_ROWS: Array<{ band: string; rows: Array<Row> }> = [
  {
    band: 'Today',
    rows: [
      {
        route: 'action',
        from: 'Maya Chen',
        subject: 'Lease renewal: can you sign by Friday?',
        preview: 'The landlord sent the new lease, I signed my part',
        pill: 'People',
        dot: 'bg-emerald-500',
        time: '9:41',
      },
      {
        route: 'goal',
        from: 'Northwind Talent',
        subject: 'Next steps for the Senior Frontend role',
        preview: 'The team would like to invite you to a final round',
        pill: 'Find a new job',
        dot: 'bg-emerald-500',
        time: '8:15',
      },
      {
        route: 'action',
        from: 'Bright Smile Dental',
        subject: 'Please confirm your appointment on Dec 3',
        preview: 'Reply YES to keep your 10:30 slot',
        pill: 'Updates',
        dot: 'bg-blue-500',
        time: '7:58',
      },
    ],
  },
  {
    band: 'Yesterday',
    rows: [
      {
        route: 'action',
        from: 'Sam Rivera',
        subject: 'Re: Dinner on Saturday?',
        preview: 'Works for us. Can you book for six?',
        pill: 'People',
        dot: 'bg-emerald-500',
        time: 'Tue',
      },
      {
        route: 'action',
        from: 'Ortiz Accounting',
        subject: 'Two forms to sign before the filing',
        preview: 'Both are in the portal, it takes five minutes',
        pill: 'People',
        dot: 'bg-emerald-500',
        time: 'Tue',
      },
    ],
  },
]

const SIDEBAR_STATUSES: Array<{ id: Status; label: string }> = [
  { id: 'in_progress', label: 'In progress' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'done', label: 'Done' },
]

const INBOXES = [
  { initial: 'P', name: 'Personal', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  { initial: 'W', name: 'Work', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  { initial: 'S', name: 'Side project', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  { initial: 'H', name: 'hello@yourdomain.dev', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
]

export const FocusMock = () => (
  <div className="overflow-hidden rounded-xl border bg-sidebar shadow-[0_24px_48px_-28px_rgb(0_0_0/0.3)]">
    <div className="flex h-12 items-center gap-2.5 border-b px-4 text-[13px]">
      <Logo className="size-5" />
      <span className="text-muted-foreground">/</span>
      <span className="font-semibold">All inboxes</span>
      <span className="ml-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Synced
      </span>
      <span className="ml-auto flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
        Y
      </span>
    </div>
    <div className="flex min-h-[23rem]">
      <div className="hidden w-52 shrink-0 flex-col gap-0.5 px-2.5 py-3 text-[13px] text-sidebar-foreground md:flex">
        <MockNav icon={<Sparkles />} label="Focus" count="5" active />
        <MockNav icon={<SquareKanban />} label="Board" />
        <p className="mx-2 mt-4 mb-1 font-mono text-[11px] text-muted-foreground">status</p>
        {SIDEBAR_STATUSES.map((s) => (
          <MockNav key={s.id} icon={<StatusIcon status={s.id} />} label={s.label} />
        ))}
        <p className="mx-2 mt-4 mb-1 font-mono text-[11px] text-muted-foreground">inboxes</p>
        {INBOXES.map((m) => (
          <MockNav
            key={m.name}
            icon={
              <span className={cn('flex size-4 items-center justify-center rounded text-[10px] font-bold', m.color)}>
                {m.initial}
              </span>
            }
            label={m.name}
          />
        ))}
      </div>
      <div className="mr-2 mb-2 min-w-0 flex-1 rounded-xl border bg-card max-md:ml-2">
        <div className="flex h-11 items-center gap-2.5 border-b px-4 text-[13px]">
          <span className="font-semibold">Focus</span>
          <span className="text-muted-foreground">Only mail that needs you</span>
          <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground lg:inline">
            filed today: info 38 · spam 12 · done 9
          </span>
        </div>
        {FOCUS_ROWS.map((group) => (
          <div key={group.band}>
            <div className="flex h-9 items-center gap-2 px-4 text-xs font-semibold text-muted-foreground">
              <ChevronDown className="size-3" />
              {group.band}
            </div>
            {group.rows.map((row, i) => {
              const RouteIcon = routeMeta(row.route).icon
              return (
                <div
                  key={row.subject}
                  className={cn(
                    'flex h-10 items-center gap-3 px-4 text-[13px]',
                    i === 0 && group.band === 'Today' && 'bg-muted/60',
                  )}
                >
                  <RouteIcon className={cn('size-3.5 shrink-0', routeMeta(row.route).color)} />
                  <span className="w-28 shrink-0 truncate font-semibold sm:w-32">{row.from}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {row.subject}
                    <span className="hidden text-muted-foreground md:inline"> · {row.preview}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs sm:inline-flex">
                    <span className={cn('size-1.5 rounded-full', row.dot)} />
                    {row.pill}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{row.time}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  </div>
)

const MockNav = ({
  icon,
  label,
  count,
  active,
}: {
  icon: ReactNode
  label: string
  count?: string
  active?: boolean
}) => (
  <div
    className={cn(
      'flex h-7 items-center gap-2 rounded-md px-2 [&_svg]:size-3.5',
      active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground ring-1 ring-sidebar-ring/50',
    )}
  >
    {icon}
    <span className="truncate">{label}</span>
    {count && <span className="ml-auto font-mono text-[11px] text-muted-foreground">{count}</span>}
  </div>
)

type Card = { from: string; subject: string; category?: Category; chip?: string; chipClass?: string }

const BOARD: Record<Route, { hint: string; count: number; cards: Array<Card> }> = {
  action: {
    hint: 'You have to reply, pay, sign, confirm or decide.',
    count: 4,
    cards: [
      {
        from: 'Maya Chen',
        subject: 'Lease renewal: can you sign by Friday?',
        category: 'people',
        chip: 'Next few days',
        chipClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
      },
      {
        from: 'Bright Smile Dental',
        subject: 'Please confirm your appointment on Dec 3',
        category: 'updates',
        chip: 'Today',
        chipClass: 'bg-red-500/15 text-red-800 dark:text-red-200',
      },
    ],
  },
  goal: {
    hint: 'Moves one of your goals forward.',
    count: 2,
    cards: [
      {
        from: 'Northwind Talent',
        subject: 'Next steps for the Senior Frontend role',
        chip: 'Find a new job',
        chipClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
      },
      {
        from: 'Priya Shah',
        subject: 'Intro: staff engineer opening at Fieldstone',
        chip: 'Find a new job',
        chipClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
      },
    ],
  },
  info: {
    hint: 'Receipts, updates, newsletters. Nothing to do.',
    count: 38,
    cards: [
      { from: 'Frontend Digest', subject: 'Issue 212: signals, streams and sync engines', category: 'newsletters' },
      { from: 'Acme Bank', subject: 'Your November statement is ready', category: 'updates' },
    ],
  },
  spam: {
    hint: 'Scams, cold sales and bulk mail you never asked for.',
    count: 12,
    cards: [
      { from: 'Derek at LeadLoop', subject: 'Quick question about your pipeline', category: 'junk' },
      { from: 'Rewards Center', subject: 'You have been selected for a gift card', category: 'junk' },
    ],
  },
}

export const BoardMock = () => (
  <div className="flex flex-wrap gap-3.5">
    {ROUTES.map((r) => (
      <div key={r.id} className="flex min-w-0 flex-[1_1_13rem] flex-col gap-2.5 rounded-xl border bg-card p-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <r.icon className={cn('size-4', r.color)} />
          {r.label}
          <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">{BOARD[r.id].count}</span>
        </div>
        <p className="mb-1 text-[13px] text-muted-foreground">{BOARD[r.id].hint}</p>
        {BOARD[r.id].cards.map((c) => (
          <div key={c.subject} className="flex flex-col gap-1.5 rounded-lg border bg-muted/50 p-3">
            <span className="text-[13px] font-semibold">{c.from}</span>
            <span className="text-[13px] text-muted-foreground">{c.subject}</span>
            <span className="flex flex-wrap gap-1.5 text-[11px]">
              {c.category && (
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2">
                  <span className={cn('size-1.5 rounded-full', labelMeta(c.category).dot)} />
                  {labelMeta(c.category).label}
                </span>
              )}
              {c.chip && <span className={cn('rounded-full px-2', c.chipClass)}>{c.chip}</span>}
            </span>
          </div>
        ))}
      </div>
    ))}
  </div>
)

const KIND_TEXT: Record<Category, string> = {
  people: 'Written to you by a person: friends, family, colleagues, clients, anyone in a real conversation.',
  updates: 'About your own accounts: receipts, orders, shipping, bills, bookings and security notices.',
  notifications: 'Automated alerts from apps: social, GitHub, Slack, calendar, comments, mentions, reminders.',
  newsletters: 'Things you subscribed to: newsletters, digests, blog posts and changelogs.',
  promotions: 'Marketing meant to sell: sales, discounts, offers, launches and event promos.',
  junk: 'Cold outreach, scams, phishing and obvious spam.',
}

export const KindsMock = () => (
  <div className="flex flex-wrap gap-px overflow-hidden rounded-xl border bg-border">
    {LABELS.map((l) => (
      <div key={l.id} className="flex flex-[1_1_18rem] flex-col gap-1.5 bg-card p-5">
        <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
          <span className={cn('size-2 rounded-full', l.dot)} />
          {l.label}
        </span>
        <span className="text-sm text-muted-foreground">{KIND_TEXT[l.id]}</span>
      </div>
    ))}
  </div>
)

export const RulesMock = () => (
  <div className="flex flex-wrap gap-3.5">
    <Rule icon={<Target />} title="Goals" text="Mail that moves a goal forward gets its own column and stays in Focus.">
      <span className="text-sm font-semibold">Find a new job</span>
      <span className="text-[13px] text-muted-foreground">
        Senior frontend roles; recruiters, interview invites, offers
      </span>
    </Rule>
    <Rule
      icon={<Workflow />}
      title="Workflows"
      text="A yes-or-no question and where matching mail goes. It can suggest these from your mail."
    >
      <span className="text-[13px]">
        <span className="font-mono text-[11px] text-muted-foreground">when jev decides </span>
        Is this a reply from a company about a job I applied to?
      </span>
      <span className="inline-flex items-center gap-2 text-[13px]">
        <span className="font-mono text-[11px] text-muted-foreground">then</span>
        <StatusIcon status="in_progress" />
        Move to In progress
      </span>
    </Rule>
    <Rule icon={<Tag />} title="Labels" text="Your own labels, by sender or by a description Jev checks.">
      <span className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
        <span className="inline-flex min-w-20 items-center gap-1.5 font-semibold">
          <span className="size-1.5 rounded-full bg-blue-500" />
          Acme
        </span>
        <span className="font-mono text-xs">jane@acme.com | acme.com</span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
        <span className="inline-flex min-w-20 items-center gap-1.5 font-semibold">
          <span className="size-1.5 rounded-full bg-amber-500" />
          Invoices
        </span>
        Invoices, quotes and payment reminders
      </span>
    </Rule>
    <Rule
      icon={<ListFilter />}
      title="Filters"
      text="Exact rules, like Gmail filters. Jev is not asked when one decides."
    >
      <FilterLine field="from">mybank.com|statements@</FilterLine>
      <FilterLine field="subject">statement|balance</FilterLine>
      <span className="flex items-center gap-2.5 text-[13px]">
        <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">then</span>
        <StatusIcon status="done" />
        Info · Updates · Done
      </span>
    </Rule>
  </div>
)

const Rule = ({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode
  title: string
  text: string
  children: ReactNode
}) => (
  <article className="flex min-w-0 flex-[1_1_26rem] flex-col gap-3 rounded-xl border bg-card p-5">
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted [&_svg]:size-4">{icon}</span>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
    <p className="text-sm text-muted-foreground">{text}</p>
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/50 px-3.5 py-3">{children}</div>
  </article>
)

const FilterLine = ({ field, children }: { field: string; children: ReactNode }) => (
  <span className="flex items-baseline gap-2.5">
    <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">{field}</span>
    <span className="font-mono text-xs">{children}</span>
  </span>
)

export const BackfillMock = () => (
  <div className="flex flex-wrap gap-3.5">
    {/* `dark` scopes the theme tokens, so this panel stays dark in both themes. */}
    <div className="dark flex min-w-0 flex-[999_1_30rem] flex-col gap-4 rounded-xl border bg-background p-6 text-foreground">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13px]">
        <span className="font-mono">backfill</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">personal@gmail.com</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Running
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-2.5 w-[41%] rounded-full bg-ring" />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-xs text-muted-foreground">
        <span>sorted 8,412</span>
        <span>queued 11,904</span>
        <span>failed 0</span>
      </div>
      <div className="flex flex-wrap gap-2 text-[13px]">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3">
          <Pause className="size-3.5" />
          Pause
        </span>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3">
          <RotateCcw className="size-3.5" />
          Retry failed
        </span>
      </div>
    </div>
    <dl className="flex min-w-0 flex-[1_1_17rem] flex-col gap-3.5 rounded-xl border bg-card p-6 text-sm">
      <BackfillNote term="queue">Batches run in the background, sized to stay inside Gmail's quota.</BackfillNote>
      <BackfillNote term="retry">Each email retries on its own; finished steps never run twice.</BackfillNote>
      <BackfillNote term="gmail">Filed mail is archived and labelled there too. Nothing is deleted.</BackfillNote>
    </dl>
  </div>
)

const BackfillNote = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="flex items-baseline gap-2.5">
    <dt className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">{term}</dt>
    <dd>{children}</dd>
  </div>
)
