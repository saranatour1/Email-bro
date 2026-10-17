import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, usePaginatedQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Globe, Mail } from 'lucide-react'
import { api } from '~/lib/api'
import { PageHeader } from '~/components/app-shell'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

const ERRORS: Partial<Record<string, string>> = {
  gmail_api_disabled:
    'The Gmail API is turned off in your Google Cloud project. Enable it under APIs & Services → Library → Gmail API, wait a minute, then connect again.',
  expired: 'That took too long. Please connect again.',
  access_denied: 'Gmail access was declined.',
}

const Settings = () => {
  const { connected, error } = Route.useSearch()
  const { results: mailboxes, status } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const startConnect = useAction(api.mailboxes.startGmailConnect)
  const connect = async () => {
    window.location.href = await startConnect()
  }

  return (
    <>
      <PageHeader>
        <h1 className="font-mono text-sm">mailboxes</h1>
        <span className="text-sm text-muted-foreground">{mailboxes.length}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={connect}>
          <Mail /> Connect Gmail
        </Button>
      </PageHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
          {connected && (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              Connected <span className="font-mono">{connected}</span>. The last 7 days of your inbox are being sorted
              now.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {ERRORS[error] ?? `Couldn't connect Gmail (${error}). Please try again.`}
            </p>
          )}

          {status !== 'LoadingFirstPage' && mailboxes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white">
                <Mail className="size-5" />
              </span>
              <p className="font-medium">There are no inboxes here yet.</p>
              <p className="text-sm text-muted-foreground">
                Connect a Gmail account or add an address on your own domain.
              </p>
              <Button size="sm" onClick={connect}>
                Connect Gmail
              </Button>
            </div>
          ) : (
            // Convex-dashboard data table: mono values, muted column headers, hairline grid.
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr className="[&>th]:border-b [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
                    <th>address</th>
                    <th>provider</th>
                    <th>status</th>
                    <th>last synced</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {mailboxes.map((m) => (
                    <tr key={m._id} className="[&>td]:border-b [&>td]:px-3 [&>td]:py-2.5 last:[&>td]:border-b-0">
                      <td className="flex items-center gap-2">
                        {m.provider === 'gmail' ? (
                          <Mail className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Globe className="size-3.5 text-muted-foreground" />
                        )}
                        {m.address}
                      </td>
                      <td className="text-muted-foreground">
                        {m.provider === 'gmail' ? 'gmail' : `domain · ${m.sendVia}`}
                      </td>
                      <td>
                        <span
                          title={m.lastError}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5',
                            m.status === 'error'
                              ? 'border-amber-500/50 text-amber-500'
                              : 'border-emerald-500/50 text-emerald-500',
                          )}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {m.status === 'error' ? 'reconnect' : 'active'}
                        </span>
                      </td>
                      <td className="text-muted-foreground">
                        {m.lastSyncedAt ? new Date(m.lastSyncedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm">Gmail</CardTitle>
                <CardDescription>
                  Sorted by Jev and mirrored back as Bro/* labels. Only Focus and In progress stay in the Gmail inbox;
                  the rest is archived there, never deleted.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button size="sm" variant="outline" onClick={connect}>
                  <Mail /> Connect Gmail
                </Button>
              </CardContent>
            </Card>
            <DomainForm />
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

const DomainForm = () => {
  const add = useMutation(api.mailboxes.addDomainMailbox)
  const [address, setAddress] = useState('')
  const [sendVia, setSendVia] = useState<'cloudflare' | 'resend'>('cloudflare')
  const [error, setError] = useState<string | null>(null)
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Own domain</CardTitle>
        <CardDescription>
          Receives through a Cloudflare Email Worker (see <code>workers/inbound</code>), replies through Cloudflare
          Email Sending or Resend.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              await add({ address, sendVia })
              setAddress('')
            } catch (err) {
              setError(err instanceof ConvexError ? String(err.data) : 'Could not add that address')
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              type="email"
              required
              placeholder="me@yourdomain.com"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-via">Send replies with</Label>
            <Select value={sendVia} onValueChange={(value) => setSendVia(value as 'cloudflare' | 'resend')}>
              <SelectTrigger id="send-via" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloudflare">Cloudflare Email Sending</SelectItem>
                <SelectItem value="resend">Resend</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="self-start">
            Add address
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute('/_app/settings')({
  validateSearch: (s: Record<string, unknown>): { connected?: string; error?: string } => ({
    connected: typeof s.connected === 'string' ? s.connected : undefined,
    error: typeof s.error === 'string' ? s.error : undefined,
  }),
  component: Settings,
})
