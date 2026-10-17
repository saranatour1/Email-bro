import { Bell, Megaphone, Newspaper, Receipt, Users } from 'lucide-react'
import type { Doc } from '../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'

export type Status = Doc<'messages'>['status']
export type Category = NonNullable<Doc<'messages'>['category']>

export const STATUSES: Array<{ id: Status; label: string; color: string }> = [
  { id: 'inbox', label: 'Inbox', color: 'text-muted-foreground' },
  { id: 'in_progress', label: 'In progress', color: 'text-amber-500' },
  { id: 'snoozed', label: 'Snoozed', color: 'text-sky-500' },
  { id: 'done', label: 'Done', color: 'text-indigo-500' },
  { id: 'cancelled', label: 'Cancelled', color: 'text-muted-foreground' },
  { id: 'spam', label: 'Spam', color: 'text-red-500' },
]

export const statusMeta = (id: Status) => STATUSES.find((s) => s.id === id) ?? STATUSES[0]

export const LABELS: Array<{ id: Category; label: string; icon: typeof Users; dot: string }> = [
  { id: 'people', label: 'People', icon: Users, dot: 'bg-emerald-500' },
  { id: 'updates', label: 'Updates', icon: Receipt, dot: 'bg-blue-500' },
  { id: 'notifications', label: 'Notifications', icon: Bell, dot: 'bg-violet-500' },
  { id: 'newsletters', label: 'Newsletters', icon: Newspaper, dot: 'bg-orange-500' },
  { id: 'promotions', label: 'Promotions', icon: Megaphone, dot: 'bg-pink-500' },
  { id: 'junk', label: 'Junk', icon: Megaphone, dot: 'bg-red-500' },
]

export const labelMeta = (id: Category) => LABELS.find((l) => l.id === id) ?? LABELS[0]

// Linear-style status glyphs: outline = open, half = in progress, filled = closed.
export const StatusIcon = ({ status, className }: { status: Status; className?: string }) => {
  const inner = 'stroke-background'
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className={cn('size-3.5 shrink-0', statusMeta(status).color, className)}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      {status === 'inbox' || status === 'in_progress' || status === 'snoozed' ? (
        <circle cx="7" cy="7" r="6" stroke="currentColor" />
      ) : (
        <circle cx="7" cy="7" r="6.5" fill="currentColor" />
      )}
      {status === 'in_progress' && <path d="M7 3.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />}
      {status === 'snoozed' && <path d="M7 4.2V7l1.8 1.2" stroke="currentColor" />}
      {status === 'done' && <path d="m4.4 7.2 1.8 1.8 3.4-3.7" className={inner} />}
      {status === 'cancelled' && <path d="m5 5 4 4M9 5 5 9" className={inner} />}
      {status === 'spam' && <path d="M7 4v3.6M7 9.8v.01" className={inner} />}
    </svg>
  )
}
