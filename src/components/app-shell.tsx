import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import {
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsUpDown,
  Inbox,
  LogOut,
  Mail,
  Plus,
  Settings,
  Sparkles,
  SquareKanban,
  Target,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { Category, Status } from '~/lib/status'
import { api } from '~/lib/api'
import { LABELS, STATUSES, StatusIcon } from '~/lib/status'
import { cn } from '~/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '~/components/ui/sidebar'

// What messages.list accepts; `board` renders several of these side by side.
export type ListView = 'focus' | 'all' | Status | Category
export type View = ListView | 'board'

export const VIEW_IDS: Array<View> = ['focus', 'board', 'all', ...STATUSES.map((s) => s.id), ...LABELS.map((l) => l.id)]

export const isView = (v: string): v is View => VIEW_IDS.includes(v as View)

export const viewLabel = (view: View) => {
  if (view === 'focus') return 'Focus'
  if (view === 'all') return 'All mail'
  if (view === 'board') return 'Board'
  return [...STATUSES, ...LABELS].find((x) => x.id === view)?.label ?? view
}

// Convex-dashboard frame (top bar, warm graphite) around a Linear-style sidebar and inset panel.
export const AppShell = ({ inbox, children }: { inbox?: Id<'mailboxes'>; children: ReactNode }) => {
  const syncNow = useMutation(api.mailboxes.syncNow)
  // New Gmail mail is pulled when the app opens; nothing polls in the background.
  useEffect(() => {
    void syncNow()
  }, [syncNow])
  return (
    <SidebarProvider className="flex min-h-0 flex-col bg-sidebar">
      <TopBar inbox={inbox} />
      <div className="flex min-h-0 flex-1">
        <AppSidebar inbox={inbox} />
        <SidebarInset className="h-[calc(100svh-3rem)] min-h-0 overflow-hidden md:m-0! md:mr-2! md:mb-2! md:h-[calc(100svh-3.5rem)] md:rounded-lg md:border">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

export const PageHeader = ({ children }: { children: ReactNode }) => {
  return <header className="flex h-11 shrink-0 items-center gap-2 border-b px-4">{children}</header>
}

const TopBar = ({ inbox }: { inbox?: Id<'mailboxes'> }) => {
  const { results: mailboxes } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const broken = mailboxes.filter((m) => m.status === 'error').length
  const count = mailboxes.length
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3">
      <SidebarTrigger className="md:hidden" />
      <Link to="/mail/$view" params={{ view: 'focus' }} search={{ inbox }} className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-linear-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white">
          <Mail className="size-3.5" />
        </span>
        <span className="font-heading text-sm font-semibold">Email Bro</span>
      </Link>
      <span className="text-muted-foreground">/</span>
      <InboxSwitcher inbox={inbox} />
      {count > 0 && (
        <Link
          to="/settings"
          search={{ inbox }}
          className={cn(
            'hidden items-center gap-2 rounded-md border px-2 py-1 font-mono text-xs sm:flex',
            broken
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
              : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500',
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {broken ? `${broken} needs reconnecting` : `Synced · ${count} inbox${count === 1 ? '' : 'es'}`}
        </Link>
      )}
      <div className="ml-auto">
        <UserMenu inbox={inbox} />
      </div>
    </header>
  )
}

const InboxSwitcher = ({ inbox }: { inbox?: Id<'mailboxes'> }) => {
  const { results: mailboxes } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  const navigate = useNavigate()
  const { view } = useParams({ strict: false })
  const current = mailboxes.find((m) => m._id === inbox)
  const go = (next?: Id<'mailboxes'>) =>
    void navigate({ to: '/mail/$view', params: { view: view ?? 'focus' }, search: { inbox: next } })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-64 gap-1.5 px-2 font-medium">
          <span className="truncate">{current?.address ?? 'All inboxes'}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Inboxes</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => go(undefined)}>
          <Inbox /> All inboxes
          {!inbox && <Check className="ml-auto" />}
        </DropdownMenuItem>
        {mailboxes.map((m) => (
          <DropdownMenuItem key={m._id} onSelect={() => go(m._id)}>
            <Mail />
            <span className="truncate font-mono text-xs">{m.address}</span>
            {m.status === 'error' && (
              <span className="size-2 shrink-0 rounded-full bg-destructive" aria-label="Needs attention" />
            )}
            {m._id === inbox && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" search={{ inbox }}>
            <Plus /> Add mailbox
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Active item is filled and outlined: the cue both Linear and the Convex dashboard use.
const itemClass =
  'h-7 text-[13px] data-[active=true]:bg-sidebar-accent data-[active=true]:font-normal data-[active=true]:ring-1 data-[active=true]:ring-sidebar-ring/50'

const INBOX_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500']

const AppSidebar = ({ inbox }: { inbox?: Id<'mailboxes'> }) => {
  const { view } = useParams({ strict: false })
  const { results: mailboxes } = usePaginatedQuery(api.mailboxes.list, {}, { initialNumItems: 50 })
  // `scope` undefined = every inbox; Status and Labels follow whichever inbox is selected.
  const nav = (id: View, icon: ReactNode, label: string, scope = inbox, active = view === id) => (
    <SidebarMenuItem key={id}>
      <SidebarMenuButton asChild isActive={active} tooltip={label} className={itemClass}>
        <Link to="/mail/$view" params={{ view: id }} search={{ inbox: scope }}>
          {icon}
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
  const page = (to: '/goals' | '/workflows' | '/settings', icon: ReactNode, label: string) => (
    <SidebarMenuItem key={to}>
      <SidebarMenuButton asChild tooltip={label} className={itemClass}>
        <Link to={to} search={{ inbox }} activeProps={{ 'data-active': true }}>
          {icon} <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )

  return (
    <Sidebar variant="inset" collapsible="icon" className="top-12 h-[calc(100svh-3rem)] pt-0">
      <SidebarContent>
        <SidebarGroup className="pt-0">
          <SidebarMenu>
            {nav('focus', <Sparkles />, 'Focus', undefined, !inbox && view === 'focus')}
            {nav('board', <SquareKanban />, 'Board', undefined, !inbox && view === 'board')}
            {nav('all', <Inbox />, 'All mail', undefined, !inbox && view === 'all')}
          </SidebarMenu>
        </SidebarGroup>
        {mailboxes.length > 0 && (
          <Section title="Inboxes">
            {mailboxes.map((m, i) => (
              <InboxItem
                key={m._id}
                mailbox={m}
                color={INBOX_COLORS[i % INBOX_COLORS.length]}
                inbox={inbox}
                view={view}
              />
            ))}
          </Section>
        )}
        <Section title="Status">
          {STATUSES.filter((s) => s.id !== 'inbox').map((s) => nav(s.id, <StatusIcon status={s.id} />, s.label))}
        </Section>
        <Section title="Labels">
          {LABELS.filter((l) => l.id !== 'junk').map((l) =>
            nav(
              l.id,
              <span className="flex size-4 items-center justify-center">
                <span className={cn('size-2 rounded-full', l.dot)} />
              </span>,
              l.label,
            ),
          )}
        </Section>
        <Section title="Automate">
          {page('/goals', <Target />, 'Goals')}
          {page('/workflows', <WorkflowIcon />, 'Workflows')}
          {page('/settings', <Settings />, 'Mailboxes')}
        </Section>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <CollapseButton />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

const INBOX_VIEWS: Array<{ id: View; label: string }> = [
  { id: 'focus', label: 'Focus' },
  { id: 'board', label: 'Board' },
  { id: 'all', label: 'All mail' },
]

// A mailbox as a Linear "team": a colored initial that expands into its own views.
const InboxItem = ({
  mailbox,
  color,
  inbox,
  view,
}: {
  mailbox: Doc<'mailboxes'>
  color: string
  inbox?: Id<'mailboxes'>
  view?: string
}) => {
  const [open, setOpen] = useState(mailbox._id === inbox)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        tooltip={mailbox.address}
        className={itemClass}
      >
        <span
          className={cn(
            'flex size-4 items-center justify-center rounded text-[10px] font-semibold text-white uppercase',
            color,
          )}
        >
          {mailbox.address[0]}
        </span>
        <span className="truncate">{mailbox.address.split('@')[0]}</span>
        {mailbox.status === 'error' && (
          <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Needs reconnecting" />
        )}
        <ChevronDown
          className={cn('ml-auto size-3 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {INBOX_VIEWS.map((v) => (
            <SidebarMenuSubItem key={v.id}>
              <SidebarMenuSubButton
                asChild
                isActive={inbox === mailbox._id && view === v.id}
                className="h-7 text-[13px]"
              >
                <Link to="/mail/$view" params={{ view: v.id }} search={{ inbox: mailbox._id }}>
                  {v.label}
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}

// Linear-style collapsible section header ("Your teams ▾").
const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  const [open, setOpen] = useState(true)
  return (
    <SidebarGroup className="py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
      >
        {title}
        <ChevronDown className={cn('size-3 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (
        <SidebarGroupContent>
          <SidebarMenu>{children}</SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}

const CollapseButton = () => {
  const { toggleSidebar, state } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={toggleSidebar}
        tooltip="Expand"
        className={cn(itemClass, 'text-sidebar-foreground/60')}
      >
        <ChevronsLeft className={cn('transition-transform', state === 'collapsed' && 'rotate-180')} />
        <span>Collapse</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

const UserMenu = ({ inbox }: { inbox?: Id<'mailboxes'> }) => {
  const me = useQuery(api.users.me)
  const { signOut } = useAuthActions()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full" aria-label="Account">
          <Avatar className="size-7">
            <AvatarImage src={me?.image} alt="" />
            <AvatarFallback className="text-xs">{me?.name?.[0] ?? '?'}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col font-normal">
          <span className="truncate text-sm">{me?.name}</span>
          <span className="truncate text-xs text-muted-foreground">{me?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" search={{ inbox }}>
            <Settings /> Mailboxes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
