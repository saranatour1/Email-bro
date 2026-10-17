import { buildMime } from '../convex/lib/mail.ts'
import { historyCursor, mergeLabelIds, shouldSyncMailbox } from '../convex/lib/gmailSync.ts'
import { weekendMorning } from '../convex/lib/snooze.ts'

const assert = (cond: unknown, message: string) => {
  if (!cond) throw new Error(message)
}

const partial = historyCursor('start', [
  {
    historyId: 'TIP',
    nextPageToken: 'next',
    history: [
      { id: 'h1', messagesAdded: [{ message: { id: 'm1' } }] },
      { id: 'h2', messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] },
    ],
  },
])
assert(partial.historyId === 'h2', `partial page stores the last record, got ${partial.historyId}`)
assert(partial.hasMore === true, 'partial page asks for another sync')
assert(partial.ids.join() === 'm1,m2', `partial ids ${partial.ids.join()}`)

const caughtUp = historyCursor('start', [
  { historyId: 'MID', nextPageToken: 'p2', history: [{ id: 'h1', messagesAdded: [{ message: { id: 'm1' } }] }] },
  { historyId: 'TIP', history: [{ id: 'h9', messagesAdded: [{ message: { id: 'm9' } }] }] },
])
assert(caughtUp.historyId === 'TIP', `caught up stores the mailbox tip, got ${caughtUp.historyId}`)
assert(caughtUp.hasMore === false, 'caught up does not chain')
assert(caughtUp.ids.join() === 'm1,m9', `caught up ids ${caughtUp.ids.join()}`)

const stuck = historyCursor('h1', [{ historyId: 'TIP', nextPageToken: 'next', history: [] }])
assert(stuck.historyId === undefined, 'a page with no new record does not move the cursor')
assert(stuck.hasMore === false, 'a page with no new record does not chain')

const afterEmpty = historyCursor('start', [
  { historyId: 'TIP', nextPageToken: 'p2', history: [] },
  { historyId: 'TIP', nextPageToken: 'p3', history: [{ id: 'h4', messagesAdded: [{ message: { id: 'm4' } }] }] },
])
assert(afterEmpty.historyId === 'h4', `empty page then a record stores h4, got ${afterEmpty.historyId}`)
assert(afterEmpty.hasMore === true, 'a later page token still chains')
assert(afterEmpty.ids.join() === 'm4', `ids after an empty page ${afterEmpty.ids.join()}`)

const now = Date.UTC(2026, 9, 17, 12, 0, 0)
assert(shouldSyncMailbox({ provider: 'gmail', lastSyncedAt: now - 120_000 }, now) === true, 'a stale mailbox syncs')
assert(shouldSyncMailbox({ provider: 'gmail' }, now) === true, 'a never-synced mailbox syncs')
assert(
  shouldSyncMailbox({ provider: 'gmail', lastSyncedAt: now - 10_000 }, now) === false,
  'a mailbox synced 10s ago waits',
)
assert(shouldSyncMailbox({ provider: 'domain' }, now) === false, 'a domain mailbox is not a Gmail sync')

const merged = mergeLabelIds({ updates: 'u', people: 'old' }, { people: 'p' })
assert(merged.updates === 'u' && merged.people === 'p', `label merge ${JSON.stringify(merged)}`)
assert(mergeLabelIds(undefined, { people: 'p' }).people === 'p', 'label merge fills an empty map')

const saturdayMorning = new Date(2026, 9, 17, 8, 30, 0).getTime()
const thisWeekend = new Date(weekendMorning(saturdayMorning))
assert(
  thisWeekend.getFullYear() === 2026 && thisWeekend.getMonth() === 9 && thisWeekend.getDate() === 17,
  'Saturday morning stays this Saturday',
)
assert(thisWeekend.getHours() === 9 && thisWeekend.getMinutes() === 0, 'weekend snooze is 9:00')

const saturdayAfternoon = new Date(2026, 9, 17, 10, 0, 0).getTime()
const nextWeekend = new Date(weekendMorning(saturdayAfternoon))
assert(nextWeekend.getDate() === 24 && nextWeekend.getHours() === 9, 'Saturday after 9:00 moves to next Saturday')

const friday = new Date(2026, 9, 16, 15, 0, 0).getTime()
const fridayPick = new Date(weekendMorning(friday))
assert(fridayPick.getDate() === 17 && fridayPick.getHours() === 9, 'Friday points at Saturday 9:00')

const mime = buildMime({ from: 'a@b.co', to: 'c@d.co', subject: 'Hi', text: 'Hello' })
const subject = mime.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)?.[1]
const body = mime.split('\r\n\r\n')[1]?.replace(/\r\n/g, '')
if (!subject || !body) throw new Error('mime is missing a subject or body')
const decode = (b64: string) => atob(b64)
assert(subject.length % 4 === 0, `subject base64 is padded, got ${subject}`)
assert(body.length % 4 === 0, `body base64 is padded, got ${body}`)
assert(decode(subject) === 'Hi', 'subject decodes')
assert(decode(body) === 'Hello', 'body decodes')

const plain = buildMime({ from: 'a@b.co', to: 'c@d.co', subject: 'abc', text: 'abc' })
const plainSubject = plain.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)?.[1] ?? ''
assert(!plainSubject.endsWith('='), 'base64 that is already aligned stays unpadded')
assert(decode(plainSubject) === 'abc', 'aligned subject decodes')

console.log('sync bugs ok')
