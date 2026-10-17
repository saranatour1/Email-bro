export const SNOOZE_MIN_MS = 60_000
const SATURDAY = 6

export const weekendMorning = (now = Date.now()) => {
  let delta = (SATURDAY - new Date(now).getDay() + 7) % 7
  const at = (days: number) => {
    const when = new Date(now)
    when.setDate(when.getDate() + days)
    when.setHours(9, 0, 0, 0)
    return when.getTime()
  }
  if (at(delta) < now + SNOOZE_MIN_MS) delta += 7
  return at(delta)
}
