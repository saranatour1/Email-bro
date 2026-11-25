import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { reset, track } from '@databuddy/sdk'
import { useAction, useMutation } from 'convex/react'
import { usePaginatedQuery, useQuery } from 'convex-helpers/react/cache/hooks'
import { useAuthActions } from '@convex-dev/auth/react'
import { ConvexError } from 'convex/values'
import { Cloud, Globe, Mail, Trash2 } from 'lucide-react'
import { api } from '~/lib/api'
import { Page } from '~/components/app-shell'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'

const ERRORS: Partial<Record<string, string>> = {
  gmail_api_disabled:
    'The Gmail API is turned off in your Google Cloud project. Enable it under APIs & Services → Library → Gmail API, wait a minute, then connect again.',
  expired: 'That took too long. Please connect again.',
  access_denied: 'Gmail access was declined.',
}

const Settings = () => {
  const { connected, error } = Route.useSearch()
  useEffect(() => {
    if (connected) track('gmail_connected')
  }, [connected])
  const { results: mailboxes, status } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const startConnect = useAction(api.mailboxes.startGmailConnect)
  const setGmailOptions = useMutation(api.mailboxes.setGmailOptions)
  const connect = async () => {
    window.location.href = await startConnect()
  }

  return (
    <Page
      title="mailboxes"
      count={mailboxes.length}
      actions={
        <Button size="sm" variant="outline" onClick={connect}>
          <Mail /> Connect Gmail
        </Button>
      }
    >
      {connected && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          Connected <span className="font-mono">{connected}</span>. The last 30 days of your inbox are being sorted now.
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
          <p className="text-sm text-muted-foreground">Connect a Gmail account or add an address on your own domain.</p>
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
                <th title="Add your labels in Gmail under the same names">label in gmail</th>
                <th title="Move filed mail out of Gmail's inbox">archive in gmail</th>
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
                  {m.provider === 'gmail' ? (
                    <>
                      <td>
                        <Switch
                          checked={m.autoLabel !== false}
                          onCheckedChange={(on) => void setGmailOptions({ mailboxId: m._id, autoLabel: on })}
                          aria-label={`Label ${m.address} in Gmail`}
                        />
                      </td>
                      <td>
                        <Switch
                          checked={m.autoArchive !== false}
                          onCheckedChange={(on) => void setGmailOptions({ mailboxId: m._id, autoArchive: on })}
                          aria-label={`Archive filed mail in ${m.address}`}
                        />
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="text-muted-foreground">
                      labels stay in the app
                    </td>
                  )}
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
              Sorted by Jev, with your labels added in Gmail under the same names; filed mail is archived in Gmail,
              never deleted. Turn either off per mailbox in the table above.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button size="sm" variant="outline" onClick={connect}>
              <Mail /> Connect Gmail
            </Button>
          </CardContent>
        </Card>
        <CloudflareAccount />
        <DomainForm />
        <DeleteAccount />
      </div>
    </Page>
  )
}

// Two clicks: the button, then the confirmation. The account disappears at once; its data goes in the background.
const DeleteAccount = () => {
  const deleteAccount = useMutation(api.users.deleteAccount)
  const { signOut } = useAuthActions()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (deleting) return
    setDeleting(true)
    setError(null)
    try {
      await deleteAccount({})
      track('account_deleted')
      reset()
      await signOut()
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : 'Could not delete your account. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <Card className="gap-4 border-destructive/40 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm">Delete account</CardTitle>
        <CardDescription>
          Signs you out everywhere and permanently deletes everything Email Bro keeps for you: connected mailboxes and
          their access, sorted mail, labels, filters, workflows, goals and backfill history. Nothing is deleted from
          your Gmail or your own domain. You get an email when it's done.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>This can't be undone.</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={confirm}>
                {deleting ? 'Deleting…' : 'Delete everything'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="self-start text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 /> Delete account and data
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// "in 29 days", in the browser's language.
const inDays = (ms: number) =>
  new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    Math.max(0, Math.round((ms - Date.now()) / 86_400_000)),
    'day',
  )

// The user's own Cloudflare account. The token is stored encrypted for this user only and deleted after 30 days.
const CloudflareAccount = () => {
  const status = useQuery(api.mailboxes.cloudflareStatus, {})
  const disconnect = useMutation(api.mailboxes.disconnectCloudflare)
  const [replacing, setReplacing] = useState(false)

  return (
    <Card className="gap-4 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm">Cloudflare account</CardTitle>
        <CardDescription>
          Sends and receives mail on your own domain through your Cloudflare account. Your account ID and API token are
          encrypted with a key only your data uses, and deleted after 30 days; enter a new token then to keep sending.
          Receiving keeps working. The token needs Email Sending, Email Routing Rules, Workers Scripts edit and Zone
          read access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status && !replacing ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-2">
              <Cloud className="size-4 text-muted-foreground" />
              <span className="font-mono">{status.domain}</span>
            </span>
            <span className="text-muted-foreground">Token deleted {inDays(status.expiresAt)}</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setReplacing(true)}>
                Enter a new token
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void disconnect({})}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <CloudflareForm defaultDomain={status?.domain} onDone={() => setReplacing(false)} />
        )}
      </CardContent>
    </Card>
  )
}

const CloudflareForm = ({ defaultDomain, onDone }: { defaultDomain?: string; onDone: () => void }) => {
  const connect = useAction(api.mailboxes.connectCloudflare)
  const [accountId, setAccountId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [domain, setDomain] = useState(defaultDomain ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="grid gap-3 md:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setSaving(true)
        try {
          await connect({ accountId, apiToken, domain })
          setApiToken('')
          onDone()
        } catch (err) {
          setError(err instanceof ConvexError ? String(err.data) : 'Could not connect that account')
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-account">Account ID</Label>
        <Input
          id="cf-account"
          required
          autoComplete="off"
          className="font-mono"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-token">API token</Label>
        <Input
          id="cf-token"
          type="password"
          required
          autoComplete="off"
          className="font-mono"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cf-domain">Domain</Label>
        <Input
          id="cf-domain"
          required
          placeholder="yourdomain.com"
          className="font-mono"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive md:col-span-3">
          {error}
        </p>
      )}
      <Button type="submit" className="self-start">
        {saving ? 'Checking…' : 'Connect'}
      </Button>
    </form>
  )
}

const DomainForm = () => {
  const addResend = useMutation(api.mailboxes.addDomainMailbox)
  const addCloudflare = useAction(api.mailboxes.addCloudflareMailbox)
  const [address, setAddress] = useState('')
  const [sendVia, setSendVia] = useState<'cloudflare' | 'resend'>('cloudflare')
  const [error, setError] = useState<string | null>(null)
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Own domain</CardTitle>
        <CardDescription>
          With your Cloudflare account, Email Bro sets up the routing rule and Worker for the address. With Resend,
          replies go out through Resend and mail arrives through the shared Worker in <code>workers/inbound</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              if (sendVia === 'cloudflare') await addCloudflare({ address })
              else await addResend({ address })
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
            <Label htmlFor="send-via">Send and receive with</Label>
            <Select value={sendVia} onValueChange={(value) => setSendVia(value as 'cloudflare' | 'resend')}>
              <SelectTrigger id="send-via" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloudflare">Your Cloudflare account</SelectItem>
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
