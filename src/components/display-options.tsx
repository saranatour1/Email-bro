import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

export type Display = {
  groupBy: 'jev' | 'status' | 'label'
  labels: boolean
  dates: boolean
  hiddenColumns: Array<string>
}

const DEFAULTS: Display = { groupBy: 'jev', labels: true, dates: true, hiddenColumns: [] }
const KEY = 'email-bro:display'

// Per-browser preference, so localStorage is enough; it may be unavailable (private mode).
export const useDisplay = () => {
  const [display, setDisplay] = useState<Display>(() => {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Display>) }
    } catch {
      return DEFAULTS
    }
  })
  const update = (patch: Partial<Display>) =>
    setDisplay((d) => {
      const next = { ...d, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Not persisted; still applies for this session.
      }
      return next
    })
  return [display, update] as const
}

const PROPERTIES = [
  { key: 'labels', label: 'Labels' },
  { key: 'dates', label: 'Dates' },
] as const

export const DisplayMenu = ({
  display,
  onChange,
  board,
}: {
  display: Display
  onChange: (patch: Partial<Display>) => void
  board: boolean
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <SlidersHorizontal /> Display
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {board && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Columns</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={display.groupBy}
              onValueChange={(v) => onChange({ groupBy: v as Display['groupBy'] })}
            >
              <DropdownMenuRadioItem value="jev">By Jev</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="status">By status</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="label">By label</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs text-muted-foreground">Show</DropdownMenuLabel>
        {PROPERTIES.map((p) => (
          <DropdownMenuCheckboxItem
            key={p.key}
            checked={display[p.key]}
            // Keep the menu open while toggling several properties.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => onChange({ [p.key]: checked })}
          >
            {p.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
