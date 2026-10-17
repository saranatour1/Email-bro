import { buildMime } from '../convex/lib/mail.ts'
import {
  CONNECT_BACKFILL,
  gmailConnectPatch,
  historyCursor,
  isGoneGmailMessage,
  mergeLabelIds,
  shouldSyncMailbox,
} from '../convex/lib/gmailSync.ts'
import { weekendMorning } from '../convex/lib/snooze.ts'
import { triagePatch } from '../convex/lib/triagePatch.ts'

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

const jev = { model: 'jev', routeProbabilities: { info: 0.9 }, urgency: 0, categoryConfidence: 0.8, sortedAt: 1 }
const info = triagePatch(
  { status: 'inbox', userMoved: true },
  { route: 'spam', category: 'newsletters', focus: true, jev },
)
assert(!('route' in info) && !('status' in info) && !('focus' in info), 'a user placement keeps its column')
assert(info.category === 'newsletters' && Object.hasOwn(info, 'triage'), 'a user placement still records the label')

const spamDrag = triagePatch(
  { status: 'spam', userMoved: true },
  { route: 'info', goalId: 'g1', category: 'people', focus: false, jev },
)
assert(!('route' in spamDrag) && !('goalId' in spamDrag), 'a spam drag keeps the spam route')

const late = triagePatch({ status: 'done' }, { route: 'action', category: 'people', focus: true, jev })
assert(
  'route' in late && late.route === 'action' && !('status' in late),
  'mail that already left the inbox keeps its status',
)

const filed = triagePatch({ status: 'inbox' }, { route: 'spam', category: 'junk', focus: true, jev })
assert(
  'status' in filed && filed.status === 'spam' && filed.focus === false && filed.route === 'spam',
  'Jev can still file untouched inbox mail',
)

const workflow = triagePatch(
  { status: 'inbox' },
  { route: 'action', category: 'people', focus: false, action: 'done', jev },
)
assert(
  'status' in workflow && workflow.status === 'done' && workflow.focus === false,
  'a matched workflow still moves untouched mail',
)

assert(isGoneGmailMessage(new Error('Gmail /messages/gone 404: missing')), 'a deleted message is skipped')
assert(!isGoneGmailMessage(new Error('Gmail /messages/gone 429: quota')), 'a quota error still fails the sync')
assert(!isGoneGmailMessage(new Error('Gmail history 404: expired')), 'a history 404 is not a missing message')
assert(!isGoneGmailMessage(new Error('Gmail /messages/gone/modify 404: missing')), 'a modify 404 is not an ingest skip')

assert(!('limit' in CONNECT_BACKFILL), 'connect backfill pages the whole 30 day window')
assert(CONNECT_BACKFILL.query === 'in:inbox newer_than:30d', 'connect backfill stays on the inbox window')

const reconnect = gmailConnectPatch('gmail', 'new-tip')
assert(JSON.stringify(reconnect) === '{"status":"active"}', 'a Gmail reconnect keeps the old cursor')
const takeover = gmailConnectPatch('domain', 'tip')
assert(
  JSON.stringify(takeover) === '{"status":"active","provider":"gmail","historyId":"tip"}',
  'a domain row becomes a Gmail mailbox',
)

console.log('sync bugs ok')
