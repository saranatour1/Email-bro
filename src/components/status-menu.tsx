import { useMutation } from 'convex/react'
import { Check, Clock } from 'lucide-react'
import { weekendMorning } from '../../convex/lib/snooze'
import type { Id } from '../../convex/_generated/dataModel'
import type { Status } from '~/lib/status'
import { api } from '~/lib/api'
import { STATUSES, StatusIcon, statusMeta } from '~/lib/status'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

const at = (days: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

export const SNOOZE_OPTIONS = [
  { label: 'Later today', until: () => Date.now() + 3 * 3_600_000 },
  { label: 'Tomorrow morning', until: () => at(1, 9) },
  { label: 'This weekend', until: () => weekendMorning() },
  { label: 'Next week', until: () => at((8 - new Date().getDay()) % 7 || 7, 9) },
]

type Props = {
  messageId: Id<'messages'>
  status: Status
  snoozedUntil?: number
  // Show the status name next to the icon (reader) or just the icon (list rows).
  withLabel?: boolean
}

export const StatusMenu = ({ messageId, status, snoozedUntil, withLabel }: Props) => {
  const setStatus = useMutation(api.messages.setStatus)
  const snooze = useMutation(api.messages.snooze)
  const meta = statusMeta(status)
  const snoozeText =
    status === 'snoozed' && snoozedUntil
      ? ` until ${new Date(snoozedUntil).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
      : ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={withLabel ? 'outline' : 'ghost'}
          size={withLabel ? 'sm' : 'icon'}
          className={cn(!withLabel && 'size-7')}
          aria-label={`Status: ${meta.label}${snoozeText}. Change status`}
          onClick={(e) => e.stopPropagation()}
        >
          <StatusIcon status={status} />
          {withLabel && (
            <span>
              {meta.label}
              {snoozeText}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onClick={(e) => e.stopPropagation()}>
        {STATUSES.filter((s) => s.id !== 'snoozed').map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => void setStatus({ messageId, status: s.id as Exclude<Status, 'snoozed'> })}
          >
            <StatusIcon status={s.id} /> {s.label}
            {s.id === status && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Clock /> Snooze
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {SNOOZE_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.label} onSelect={() => void snooze({ messageId, until: o.until() })}>
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
