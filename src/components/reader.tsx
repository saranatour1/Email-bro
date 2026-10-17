import { useEffect, useState } from 'react'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { Check, ChevronDown, Mail, Reply, ScanText, X } from 'lucide-react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { api } from '~/lib/api'
import { ROUTES, labelMeta, routeMeta } from '~/lib/status'
import { cn } from '~/lib/utils'
import { Pill } from '~/components/message-list'
import { StatusMenu } from '~/components/status-menu'
import { Button } from '~/components/ui/button'
import { ScrollArea } from '~/components/ui/scroll-area'
import { EmailBody } from '~/components/email-body'

export const Reader = ({
  id,
  wide,
  onClose,
}: {
  id: Id<'messages'>
  // Fills the space next to the list; on the board it is a fixed side panel.
  wide: boolean
  onClose: () => void
}) => {
  const message = useQuery(api.messages.get, { messageId: id })
  const markRead = useMutation(api.messages.markRead)
  const setStatus = useMutation(api.messages.setStatus)
  const read = useAction(api.messages.read)
  const [replying, setReplying] = useState(false)
  const [content, setContent] = useState<Awaited<ReturnType<typeof read>> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (message && !message.read) void markRead({ messageId: id })
  }, [message, id, markRead])

  // Fetched live from the mailbox each time; never stored.
  useEffect(() => {
    let current = true
    read({ messageId: id }).then(
      (c) => current && setContent(c),
      () => current && setLoadError("Couldn't load this email. Try again in a moment."),
    )
    return () => {
      current = false
    }
  }, [id, read])

  const width = wide ? 'min-w-0 flex-1' : 'w-[34rem] shrink-0 border-l'
  if (message === undefined) {
    return <section className={cn('p-8 text-center text-sm text-muted-foreground', width)}>Loading…</section>
  }
  const label = message.category ? labelMeta(message.category) : undefined

  return (
    <section className={cn('flex flex-col', width)}>
      <header className="flex h-11 shrink-0 items-center gap-1.5 border-b px-2">
        <StatusMenu messageId={id} status={message.status} snoozedUntil={message.snoozedUntil} withLabel />
        {label && (
          <Pill>
            <span className={cn('size-1.5 rounded-full', label.dot)} />
            {label.label}
          </Pill>
        )}
        <Pill className="hidden max-w-56 font-mono sm:flex">
          <Mail className="size-3" />
          <span className="truncate">{message.mailboxAddress}</span>
        </Pill>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setReplying(true)}>
            <Reply /> Reply
          </Button>
          {message.status !== 'done' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await setStatus({ messageId: id, status: 'done' })
                onClose()
              }}
            >
              <Check /> Done
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <article className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-8">
          <h2 className="text-lg font-semibold">{message.subject}</h2>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{message.fromName}</span>
            {content && <span className="font-mono"> &lt;{content.from}&gt;</span>}
            {content?.replyTo && content.replyTo !== content.from && (
              <span>
                {' '}
                · replies to <span className="font-mono">&lt;{content.replyTo}&gt;</span>
              </span>
            )}
            {' · '}
            {new Date(message.receivedAt).toLocaleString()}
          </div>
          <JevPanel message={message} markdown={content?.markdown} />
          {replying && <Composer id={id} onDone={() => setReplying(false)} />}
          <div className="mt-3">
            {content ? (
              <EmailBody html={content.html} text={content.text} />
            ) : (
              <p className="text-sm text-muted-foreground">{loadError ?? 'Loading…'}</p>
            )}
          </div>
        </article>
      </ScrollArea>
    </section>
  )
}

const URGENCY = ['Can wait', 'This week', 'Today']

// How Jev sorted this email: its decision, the odds behind it, and the clean text it read.
const JevPanel = ({ message, markdown }: { message: Doc<'messages'>; markdown?: string }) => {
  const { results: goals } = usePaginatedQuery(api.goals.list, {}, { initialNumItems: 20 })
  const [showText, setShowText] = useState(false)
  const jev = message.jev
  if (!message.route || !jev) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <ScanText className="size-4 animate-pulse" /> Jev is reading this email…
      </p>
    )
  }
  const route = routeMeta(message.route)
  const goal = goals.find((g) => g._id === message.goalId)
  const urgency = URGENCY[Math.min(2, Math.round(jev.urgency))]

  return (
    <section className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Jev sorted this into</span>
        <Pill className={route.color}>
          <route.icon className="size-3" /> {route.label}
        </Pill>
        {goal && <Pill className="text-emerald-500">{goal.title}</Pill>}
        <Pill>{urgency}</Pill>
      </div>
      <div className="grid gap-1.5">
        {ROUTES.filter((r) => r.id in jev.routeProbabilities).map((r) => {
          const p = jev.routeProbabilities[r.id] ?? 0
          return (
            <div key={r.id} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full bg-current', r.color)}
                  style={{ width: `${p * 100}%` }}
                />
              </span>
              <span className="text-right font-mono text-muted-foreground">{Math.round(p * 100)}%</span>
            </div>
          )
        })}
      </div>
      {markdown !== undefined && (
        <div>
          <button
            type="button"
            aria-expanded={showText}
            onClick={() => setShowText(!showText)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn('size-3 transition-transform', !showText && '-rotate-90')} />
            What Jev read
          </button>
          {showText && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-background p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
              {markdown || '(empty after cleaning)'}
            </pre>
          )}
        </div>
      )}
    </section>
  )
}

const Composer = ({ id, onDone }: { id: Id<'messages'>; onDone: () => void }) => {
  const reply = useAction(api.messages.reply)
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Write a reply…' })],
    autofocus: true,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
  })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const text = editor?.getText({ blockSeparator: '\n\n' }).trim() ?? ''

  return (
    <form
      className="flex flex-col gap-2 rounded-md border p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setSending(true)
        setError(null)
        try {
          await reply({ messageId: id, text })
          onDone()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Sending failed')
        } finally {
          setSending(false)
        }
      }}
    >
      <EditorContent
        editor={editor}
        aria-label="Reply"
        className="prose prose-sm min-h-28 max-w-none dark:prose-invert [&_.tiptap]:min-h-28 [&_.tiptap]:outline-none"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={sending || !text}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  )
}
