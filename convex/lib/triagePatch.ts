type Route = 'action' | 'goal' | 'info' | 'spam'
type Category = 'people' | 'updates' | 'notifications' | 'newsletters' | 'promotions' | 'junk'
type Action = 'focus' | 'in_progress' | 'done' | 'cancelled' | 'spam'
type Status = 'inbox' | 'in_progress' | 'done' | 'cancelled' | 'spam'

export type TriageDecision<TGoal extends string, TWorkflow extends string, TFilter extends string> = {
  route: Route
  goalId?: TGoal
  category: Category
  focus: boolean
  action?: Action
  jev: {
    model: string
    routeProbabilities: Record<string, number>
    urgency: number
    categoryConfidence: number
    workflowId?: TWorkflow
    filterId?: TFilter
    sortedAt: number
  }
}

// A user placement keeps category and odds only. Anything still in the inbox can take Jev's status.
export const triagePatch = <TGoal extends string, TWorkflow extends string, TFilter extends string>(
  message: { status: string; userMoved?: boolean },
  decision: TriageDecision<TGoal, TWorkflow, TFilter>,
) => {
  const recorded = { category: decision.category, jev: decision.jev, triage: undefined, triageFailed: undefined }
  if (message.userMoved) return recorded
  const placed = { ...recorded, route: decision.route, goalId: decision.goalId }
  if (message.status !== 'inbox') return placed
  const spam = !decision.action && decision.route === 'spam'
  const status: Status = decision.action
    ? decision.action === 'focus'
      ? 'inbox'
      : decision.action
    : spam
      ? 'spam'
      : 'inbox'
  return { ...placed, status, focus: decision.focus && !spam }
}
