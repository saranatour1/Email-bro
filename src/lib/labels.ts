import type { Doc } from '../../convex/_generated/dataModel'

export type LabelColor = Doc<'labels'>['color']

// Full class names so Tailwind keeps them.
export const LABEL_COLORS: Array<{ id: LabelColor; dot: string }> = [
  { id: 'gray', dot: 'bg-zinc-400' },
  { id: 'red', dot: 'bg-red-500' },
  { id: 'orange', dot: 'bg-orange-500' },
  { id: 'amber', dot: 'bg-amber-500' },
  { id: 'green', dot: 'bg-emerald-500' },
  { id: 'teal', dot: 'bg-teal-500' },
  { id: 'blue', dot: 'bg-blue-500' },
  { id: 'indigo', dot: 'bg-indigo-500' },
  { id: 'purple', dot: 'bg-violet-500' },
  { id: 'pink', dot: 'bg-pink-500' },
]

export const labelDot = (color: LabelColor) => LABEL_COLORS.find((c) => c.id === color)?.dot ?? LABEL_COLORS[0].dot
