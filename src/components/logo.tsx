import { cn } from '~/lib/utils'

// Three offset rings crossed by a line, with two ticks at its tail (from the hand sketch).
export const Logo = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.1}
    strokeLinecap="round"
    aria-hidden
    className={cn('size-6 shrink-0', className)}
  >
    <circle cx="13.9" cy="17.1" r="9" />
    <circle cx="16" cy="16" r="9" />
    <circle cx="18.1" cy="14.9" r="9" />
    <path d="M2.5 8.4 30 23.9" />
    <path d="M4.6 11.2 6.2 6.2M6.8 12.4 8.4 7.4" />
  </svg>
)
