import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Settings2, Tag } from 'lucide-react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { api } from '~/lib/api'
import { labelDot } from '~/lib/labels'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

export const LabelDot = ({ label, className }: { label: Pick<Doc<'labels'>, 'color'>; className?: string }) => (
  <span className={cn('size-2 shrink-0 rounded-full', labelDot(label.color), className)} />
)

// Quiet label marks for a row or card: a colored dot and the name, no border. Past `max`, a "+N".
export const LabelChips = ({
  ids,
  max = 2,
  className,
}: {
  ids?: Array<Id<'labels'>>
  max?: number
  className?: string
}) => {
  const labels = useQuery(api.labels.list, ids?.length ? {} : 'skip')
  // Ids of deleted labels stay on old mail; they simply don't show.
  const shown = (labels ?? []).filter((l) => ids?.includes(l._id))
  if (!shown.length) return null
  const extra = shown.length - max
  return (
    <span
      className={cn('flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground', className)}
      title={shown.map((l) => l.name).join(', ')}
    >
      {shown.slice(0, max).map((l) => (
        <span key={l._id} className="flex max-w-28 items-center gap-1.5">
          <LabelDot label={l} />
          <span className="truncate">{l.name}</span>
        </span>
      ))}
      {extra > 0 && <span>+{extra}</span>}
    </span>
  )
}

// Add or remove the user's labels on one email.
export const LabelMenu = ({ messageId, labelIds }: { messageId: Id<'messages'>; labelIds?: Array<Id<'labels'>> }) => {
  const labels = useQuery(api.labels.list, {})
  const setOnMessage = useMutation(api.labels.setOnMessage)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Tag /> Label
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {labels?.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No labels yet.</p>}
        {labels?.map((l) => (
          <DropdownMenuCheckboxItem
            key={l._id}
            checked={!!labelIds?.includes(l._id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => void setOnMessage({ messageId, labelId: l._id, on })}
          >
            <LabelDot label={l} />
            <span className="truncate">{l.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/labels" search={true}>
            <Settings2 /> Manage labels
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
