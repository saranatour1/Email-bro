// Gmail-style matching: case-insensitive "contains", with `|` separating alternatives. An empty pattern matches.
const hit = (pattern: string | undefined, text: string) =>
  !pattern ||
  pattern
    .toLowerCase()
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => text.toLowerCase().includes(p))

// The first filter whose every criterion matches; `from` is checked against "Name <address>".
export const matchFilter = <TFilter extends { from?: string; subject?: string }>(
  filters: Array<TFilter>,
  mail: { fromName: string; from: string; subject: string },
) => filters.find((f) => hit(f.from, `${mail.fromName} <${mail.from}>`) && hit(f.subject, mail.subject))
