const OPEN = ['inbox', 'in_progress'] as const

// Handled mail leaves the board. Spam stays visible while it is still spam, inbox, or in progress.
export const boardStatuses = (route: string) => (route === 'spam' ? (['spam', ...OPEN] as const) : OPEN)
