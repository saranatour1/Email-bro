# Email Bro guidelines

Email Bro is one calm place for several inboxes (Gmail accounts plus addresses on your own domain). Jev sorts every incoming email, and the user only sees what needs them. These rules are for people and coding agents alike.

## Before you build anything

- **Look it up first.** Before using a library, API or feature that's new to this codebase, read its current docs online. Don't write it from memory: Convex, Convex Auth v2, the AI SDK and the gateway all change quickly.
- **Check the Convex components directory** ([convex.dev/components](https://www.convex.dev/components)) for a component that already does the job before building it by hand.
- **Ask "do I need it?"** before adding a scheduled function or a cron. Most work belongs in the mutation or action that triggers it. Today's justified uses: `snooze` wake-ups (`scheduler.runAt`), and handing work from a mutation to an action that calls an external API (Gmail write-back, `syncNow`, backfill batches). There are no crons: Gmail syncs when the app opens.
- **Keep it simple.** Before adding a function, ask whether you need a new function at all, and whether it needs to return anything.

## Product principles

1. **No noise, no extra work.** The default view (Focus) shows only mail that needs the user. Everything else is filed, never thrown away.
2. **Never store email content.** The database keeps only ids, the subject and the sender's name (or their domain when there's no name). Bodies, addresses and attachments are fetched from the mailbox when the user opens or answers an email, and never written down. That includes AI summaries and workflow step results. The one exception is domain mail, which has no mailbox to fetch from: its raw email is kept AES-GCM encrypted in file storage, with the key only in the `MAIL_ENCRYPTION_KEY` env var.
3. **Never lose mail.** Nothing permanently deletes an email. "Done", "Cancelled", "Spam" and filing all mean _archive_ (remove Gmail's `INBOX` label). We only ask for `gmail.modify`, which can't permanently delete.
4. **Never send without the user.** Mail only leaves when the user presses Send. No auto-replies and no AI-sent drafts.
5. **One click beats a shortcut.** Every action is reachable with the mouse in one or two clicks.
6. **The user's choice wins over the model's.** If the user changes a status before triage finishes, triage only adds labels.

## Stack and commands

| Piece        | Choice                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Backend      | Convex (`convex/`), cloud dev deployment in `.env.local`                                          |
| Auth         | Convex Auth **v2 beta** (`@convex-dev/auth@2.0.0-beta.0`), Google sign-in                         |
| Helpers      | `convex-helpers`: use it whenever it already solves the problem (see below)                       |
| Validation   | Convex `v` validators, plus **Zod** or **ArkType**, whichever the project uses                    |
| Durable jobs | `@convex-dev/workflow` (per-email triage), `@convex-dev/batch-worker` (Gmail backfill queue)      |
| AI           | Convex AI Gateway through the AI SDK (`ai` + `@convex-dev/ai-sdk-provider`)                       |
| Frontend     | TanStack Start file routes, React 19, Tailwind v4, shadcn/ui, TipTap (email bodies, reply editor) |

```bash
pnpm dev                  # convex dev + vite on :3000
pnpm lint                 # tsc + eslint, zero warnings allowed
npx tsc -p convex --noEmit
npx convex dev --once     # push backend once
```

## Code style

- **Prettier owns formatting** (`.prettierrc`): 2-space indent, no semicolons, single quotes, trailing commas, 120-column lines.
- **One line when it fits.** Declarations, objects, arguments and imports stay on a single line up to 120 columns; `objectWrap: "collapse"` joins objects that were split by hand. Break lines only when Prettier has to.
- Run `pnpm format` (or `npx prettier --write <files>`) before you finish; don't hand-format around it.
- **Arrow functions everywhere:** components, hooks, helpers and callbacks are `const name = (…) => …`, not `function name()`.
  ```ts
  const Settings = () => { … }
  export const shortDate = (ms: number) => …
  ```
  Arrow functions aren't hoisted, so define a component **above** anything that references it at module load, such as `createFileRoute(...)({ component: Settings })`. Put the `Route` export at the bottom of route files. Exceptions: shadcn files in `components/ui/`, and handlers inside Convex builders (`query({ handler: async (ctx, args) => … })`), which are arrows already.

## Convex structure

We follow [Ian Macartney's code organization pattern](https://github.com/ianmacartney/code-organization-pattern): functions are **defined** inside `models/`, and everything the client may call is **exported** from one folder, `convex/api/`. So the public surface lives in one place, however the code inside is organized.

```
convex/
  api/                   # the public surface: re-exports only
    messages.ts          # → api.messages.* on the client
    mailboxes.ts         # → api.mailboxes.*
    users.ts             # → api.users.*
    workflows.ts         # → api.workflows.* (custom Jev workflows)
    auth.ts              # → api.auth.* (Convex Auth session + Google sign-in)
  models/
    messages/            # one folder per table
      list.ts            # one file per feature: list, get (public); getInternal
      status.ts          # markRead, setStatus, snooze (public); wake; moveTo()
      read.ts            # read (public): the email, fetched live, never stored
      ingest.ts          # ingest, existingExternalIds
      triage.ts          # the triage workflow: classify (incl. custom workflows), saveTriage
      send.ts            # reply (public)
      utils.ts           # getOwned, loadMail (Gmail fetch or decrypt)
    mailboxes/
      list.ts            # list (public); get, getByAddress
      domain.ts          # addDomainMailbox (public)
      utils.ts           # ingestGmailMessage (metadata headers only)
      gmail/             # a big feature can be a folder
        connect.ts       # startGmailConnect (public); OAuth state, tokens, finishConnect()
        sync.ts          # syncNow (public, on app open), sync, patch
        backfill.ts      # batch-worker queue: start, enqueue, getBatch, claimBatch, fetchBatch
        writeBack.ts     # applyTriage, syncInbox: mirror labels and status into Gmail
    jevWorkflows/
      manage.ts          # list, create, setEnabled, remove (public); forTriage
    users/
      auth.ts            # me (public); createUser, onSignIn (Convex Auth callbacks)
  lib/                   # helpers reused across tables
    functions.ts         # userQuery / userMutation / userAction (auth custom functions)
    gmail.ts             # Gmail REST + OAuth token helpers
    mail.ts              # MIME parsing and building (in memory only)
    crypto.ts            # AES-GCM for domain mail, SHA-256 dedupe keys
  schema.ts  http.ts  convex.config.ts  auth.config.ts
```

- **API files** in `convex/api/` hold re-exports only, no logic. Anything the client needs gets added here:
  ```ts
  // convex/api/messages.ts
  import { listApi } from '../models/messages/list'
  import { statusApi } from '../models/messages/status'

  export const { list, get } = listApi
  export const { setStatus, snooze } = statusApi
  ```
- **The client calls `api.<file>.<function>`.** Convex names functions after their file path, so the generated reference is `api.api.messages.list`. `src/lib/api.ts` re-exports that branch once, and every component imports `api` from there, never from `convex/_generated/api`:
  ```ts
  // src/lib/api.ts
  import { api as generated } from '../../convex/_generated/api'

  export const api = generated.api
  ```
  ```ts
  // a component
  import { api } from '~/lib/api'

  const mailboxes = useQuery(api.mailboxes.list)
  const setStatus = useMutation(api.messages.setStatus)
  ```
  Don't spread or copy the generated object (`{ ...generated.api }`). It's a proxy with no own keys, so a copy comes out empty.
- **Feature files** define public functions without exporting them one by one. They group them in an object (`listApi`), so the API file decides what's public:
  ```ts
  // convex/models/messages/list.ts
  const list = query({ args: { … }, handler: async (ctx, args) => { … } })
  const get = query({ … })
  export const listApi = { list, get }
  ```
- **Internal functions** are exported directly from their feature file (`internal.models.messages.ingest.ingest`). They don't go through an API file.
- **Nothing public outside `api/`.** A `query`, `mutation` or `action` that isn't re-exported from `convex/api/` isn't reachable by the client. Grouping in feature files keeps it that way: they export the `…Api` object, never the function itself.
- **Framework files stay at the root:** `schema.ts`, `http.ts`, `convex.config.ts`, `auth.config.ts` (and `crons.ts` if one is ever justified). Convex Auth's functions live in `api/auth.ts` like any other public function; its client takes them as references (`api.auth`), so the path doesn't matter to it.

### Plain helpers (not Convex functions)

- **Write a helper only when it's needed.** No wrappers, no "for later" functions, no helper that just renames another call.
- **Helpers never live in API files or next to the function definitions they don't belong to.** Pick the place by reuse:
  - used by **one table** → `models/<table>/utils.ts`
  - reused **across tables** → `convex/lib/<topic>.ts`
- **Return a value only when a caller uses it.** Otherwise return nothing.

## Convex function rules

Read `convex/_generated/ai/guidelines.md` first. This project overrides it in two places:

- **Default to internal.** Make a function public (`query`, `mutation`, `action`) only when the client calls it. Everything called from other functions, workflows, crons, the scheduler or HTTP routes is `internalQuery` / `internalMutation` / `internalAction`.
- **Return validators: internal functions yes, public functions no.**
  - Internal functions declare `returns:`. Other server code depends on their shape.
  - Public functions don't declare `returns:`; the client gets its types from the generated `api`. The convex-lint hook will still suggest `returns:` on public functions; ignore it here.
- **Args are always validated.** Every function, public or internal, has `args`.
- **Auth goes in a custom function**, not repeated in every handler. Public functions that need a signed-in user use `userQuery` / `userMutation` / `userAction` from `convex/lib/functions.ts` (built with `convex-helpers/server/customFunctions`), which put `ctx.userId` on the context and throw `ConvexError('Not signed in')` otherwise. Never accept a `userId` argument. `users.me` stays a plain `query` because it must return `null` when signed out.
- **When an action references its own module through `internal`** (workflows do), annotate the handler's return type, or TypeScript's inference turns circular.
- **Secrets stay in `mailboxSecrets`.** Only internal functions read them.
- **Every status change goes through one shared helper** (today `moveTo()`). It keeps `focus`, `snoozedUntil`, `read` and the Gmail inbox in step. Invariant: `focus === true` only while `status === 'inbox'`.
- **Index sparingly.** One per-user index per view (`by_userId_and_<field>_and_receivedAt`), plus the dedupe index. Scoping to one inbox is a `.filter()` on that index (with its lint rule disabled and a `shortcut:` note); add a per-mailbox index only when it gets slow.
- **Env vars are declared in `convex/convex.config.ts`** and read with `env` from `./_generated/server`, never `process.env`.
- **Use `.paginate()` whenever possible**, including fixed reads (`.paginate({ numItems: n, cursor: null })`). `.take(n)` only where an API needs exactly one batch, like a batch-worker work query; `.first()` / `.unique()` for single rows.

### Validation

- **Function args:** Convex `v` validators by default.
- **Zod projects:** use `convex-helpers/server/zod4` (`zCustomQuery`, `zCustomMutation`, `zid`). Define the custom builder once next to the other custom functions, and reuse it.
- **ArkType projects:** convex-helpers has no ArkType wrapper. Keep `v` for args and use ArkType at the boundaries: HTTP bodies, external API responses, model outputs. ArkType implements Standard Schema, and `convex-helpers/standardSchema` converts the other way (`v` → Standard Schema) when a library expects one.
- **Always validate at trust boundaries:** `/inbound/email` (shared secret), OAuth callbacks (one-time state), Gmail and gateway responses before they're stored.

### convex-helpers: reach for it first

| Need                                                           | Use                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Auth or shared context on every call                           | `customQuery` / `customMutation` / `customAction`                  |
| Zod args                                                       | `convex-helpers/server/zod4`                                       |
| Reusable validators (`doc`, `partial`, `nullable`, `literals`) | `convex-helpers/validators`                                        |
| One-to-many / many-to-many lookups                             | `getOneFrom`, `getManyFrom`, `getManyVia` (`server/relationships`) |
| Side effects on every write to a table                         | Triggers (`server/triggers`)                                       |
| Pagination across merged or filtered index ranges              | `paginator`, QueryStreams (`server/stream`)                        |
| Status, data and error from one client hook                    | `useQuery` from `convex-helpers/react`                             |

Check the convex-helpers README before hand-rolling any of these.

## AI rules

- **Always go through the Convex AI Gateway with the AI SDK.** No provider keys, no hand-written `fetch`:
  ```ts
  import { experimental_decide as decide, generateText } from 'ai'
  import { convexGateway } from '@convex-dev/ai-sdk-provider'

  await decide({ model: convexGateway.evaluationModel('~typesafe/jev-latest'), state, questions })
  await generateText({ model: convexGateway('anthropic/claude-haiku-5.5'), prompt })
  ```
  The gateway needs a paid team and a cloud deployment.
- **Jev decides, LLMs write.** Jev (`choice`, `boolean`, `score`) makes every judgment. A generative model only writes text the user reads.
- **Store raw probabilities, keep policy in code.** Changing a threshold must never mean asking Jev again.
- **One `decide` call for independent questions**, with one narrow judgment per question. Give state as named fields and refer to them in backticks. Always offer a way out (e.g. a `junk` category).
- **No stored AI output that reveals content.** Store Jev's probabilities, not generated summaries. If generated text is ever needed, produce it on demand and return it, don't save it.
- **Custom workflows ride along.** Each enabled workflow is one extra `boolean` question in the same `decide` call, keyed by its id; the first one at ≥ 0.7 applies. Cap the set (20) so one call stays small.
- **Alpha APIs move.** Keep `/alpha/decisions` / `experimental_decide` calls in one place.

## Frontend structure

Plain, simple and DRY. Use the layout TanStack Start and shadcn recommend:

```
src/
  routes/        # file routes only: params, search, layout, page component
  components/    # app components; components/ui is shadcn-generated, don't hand-edit
  hooks/         # React hooks that hold real logic (state, effects, several calls)
  lib/           # pure helpers and constants (formatting, status metadata, cn)
  styles/
```

- **Routes stay thin.** A route file validates params and search, then renders components. Logic lives in hooks; markup lives in components.
- **Call Convex directly.** Components use `useQuery(api.mailboxes.list)`, `useMutation(...)` and `usePaginatedQuery(...)` inline, even when the same call appears in several places. Don't wrap a single Convex call in a hook:
  ```ts
  // ✗ a hook that only renames one call
  export const useMailboxes = () => useQuery(api.mailboxes.list)

  // ✓ in the component
  const mailboxes = useQuery(api.mailboxes.list)
  ```
  A hook earns its place when it adds behavior: combining calls, local state, effects, or persistence (e.g. `useDisplay`). Even then, no caching layers or state machines.
- **DRY at the second copy.** The second time markup or logic is duplicated, extract it to a component, hook or `lib` helper. Not before.
- **State goes in the URL.** The view and the open message are path params; the inbox scope is `?inbox=`. Links within `/mail` pass `search={true}`.
- **Per-browser preferences** go in `localStorage`, wrapped in `try/catch`. Anything that must sync across devices goes in Convex.
- **shadcn:** add components with `npx shadcn@latest add <name>` and answer **no** to overwrites. `cn` comes from the `cn` package.
- **Email bodies render through TipTap** (`EmailBody`, read-only StarterKit). Its schema has no image or script nodes, so remote images and tracking pixels never load. Never render email HTML with `dangerouslySetInnerHTML`. The reply editor is TipTap too; send `editor.getText()`.

### TanStack Start

Follow the official docs ([overview](https://tanstack.com/start/latest/docs/framework/react/overview), [routing](https://tanstack.com/start/latest/docs/framework/react/guide/routing), [selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr)). For Convex-specific patterns, the official [`start-convex-trellaux`](https://github.com/TanStack/router/tree/main/examples/react/start-convex-trellaux) example is the reference.

- **Two required files:** `src/router.tsx` (`getRouter()`: preloading, scroll restoration, the providers in `Wrap`) and `src/routes/__root.tsx` (the HTML document, `<HeadContent />`, `<Scripts />`). `routeTree.gen.ts` is generated; never edit it.
- **Convex is the backend.** Data reads and writes go through Convex functions, not `createServerFn`. Use server functions, server routes or middleware only for work that must run on the web server itself (none today), and give them a validator and server-side auth like any other endpoint.
- **Rendering is chosen per route** with selective SSR. Signed-in pages use `ssr: false` on the `_app` layout because the session token lives in the browser. Public pages (sign-in, marketing) may render on the server.
- **Loaders** only for data that's available before the component renders. Behind sign-in, components read with Convex hooks. If a route ever preloads, use `context.queryClient.ensureQueryData(convexQuery(...))` with the existing Query integration, not a second cache.
- **Params and search are typed at the route.** Use `params.parse` / `validateSearch`, and throw `notFound()` or `redirect()` from the route, not inside components.
- **TypeScript config:** keep `verbatimModuleSyntax` **off**; the Start docs warn it can leak server bundles into client bundles. Prefer Vite's built-in `resolve.tsconfigPaths: true` over the `vite-tsconfig-paths` plugin.

### Routes

| Route file                       | URL                      | Purpose                                                        |
| -------------------------------- | ------------------------ | -------------------------------------------------------------- |
| `index.tsx`                      | `/`                      | Redirects to `/mail/focus`                                     |
| `_app.tsx`                       | (pathless)               | Auth gate, top bar, sidebar; `ssr: false`; validates `?inbox=` |
| `_app.mail.$view.tsx`            | `/mail/$view`            | List or board; unknown views give `notFound()`                 |
| `_app.mail.$view.$messageId.tsx` | `/mail/$view/$messageId` | Reader in the parent's `<Outlet />`                            |
| `_app.settings.tsx`              | `/settings`              | Mailboxes                                                      |
| `_app.workflows.tsx`             | `/workflows`             | Custom Jev workflows                                           |

## Design system: Linear × Convex dashboard

- **Frame (Convex):** a 48 px top bar (logo · `/` · inbox switcher · health pill · avatar); below it the sidebar and an inset, rounded, bordered content panel. Collapse control at the bottom of the sidebar.
- **Palette:** warm graphite tokens (oklch hue ≈ 70) in `src/styles/app.css`, light and dark; indigo `--ring` for focus and the active item. Use tokens, not raw colors. The exceptions are status and label colors (from `lib/status.tsx`) and health colors: emerald = healthy, amber = needs attention.
- **Type:** Plus Jakarta Sans for UI text, Sora for headings, card titles and the wordmark (`font-heading`), JetBrains Mono for machine values (addresses, table cells, counts). All self-hosted with Fontsource (`@fontsource-variable/*`, imported in `app.css`); no Google Fonts requests.
- **Density (Linear):** sidebar items `h-7` at 13 px; rows `h-10` at 13 px; headers `h-11`; date bands `h-9`.
- **Active nav:** `bg-sidebar-accent` plus `ring-1 ring-sidebar-ring/50`.
- **Lists:** collapsible date bands; rows read status → sender → subject → preview → pills → date, with no divider lines. Chips use `<Pill>`, and status glyphs only `<StatusIcon>`.
- **Tables (Convex):** mono values, lowercase muted headers, hairline grid.
- **Empty states:** gradient mark, one sentence, one action.
- **Copy:** sentence case, short, no exclamation marks. Say what will happen.

## Before you call something done

1. `pnpm lint` and `npx tsc -p convex --noEmit` pass with zero warnings.
2. `npx convex dev --once` deploys cleanly.
3. Changes you can see in the UI are checked in the browser; say what couldn't be checked.
4. No secrets in code: credentials live in Convex env vars or `wrangler secret`.
5. A shortcut with a known limit gets a `shortcut:` comment that says when to upgrade it.

## Follow-ups: where the code doesn't match yet

These guidelines are ahead of the code. Until each item is done, follow the guideline for new code.

- [x] Move `convex/` to `models/<table>/<feature>.ts` with API files in `convex/api/` (`messages.ts`, `mailboxes.ts`, `users.ts`, `auth.ts`) and `src/lib/api.ts` on the client; move `gmail.ts`, `triage.ts` and `send.ts` into their models. `startConnect` is now `api.mailboxes.startGmailConnect` and `send.reply` is now `api.messages.reply`.
- [x] Replace `requireUser()` calls with a convex-helpers custom function that puts the user on `ctx`.
- [x] Drop `returns:` from public functions; turn functions the client never calls into internal ones.
- [x] Turn `verbatimModuleSyntax` off in `tsconfig.json`, and swap `vite-tsconfig-paths` for `resolve.tsconfigPaths`.
- [x] Remove `src/hooks/use-mailboxes.ts` and call `useQuery(api.mailboxes.list)` directly at its 5 call sites.
- [x] Convert `function` declarations to arrow functions (see Code style).
