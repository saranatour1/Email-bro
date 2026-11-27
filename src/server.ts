import { trackAgents } from '@databuddy/sdk/agents'
import handler from '@tanstack/react-start/server-entry'

type Env = { DATABUDDY_WEBSITE_ID: string }
type Context = { waitUntil: (promise: Promise<unknown>) => void }

// The Cloudflare Worker entry (wrangler.jsonc `main`): TanStack Start's default handler, plus Databuddy AI crawler
// tracking. GPTBot, ClaudeBot and most AI crawlers don't run JavaScript, so the browser script never sees them and
// the server reports them instead. Not awaited: waitUntil sends the hit after the response, and trackAgents never throws.
export default {
  fetch: (request: Request, env: Env, ctx: Context) => {
    ctx.waitUntil(trackAgents(request, { websiteId: env.DATABUDDY_WEBSITE_ID }))
    return handler.fetch(request)
  },
}
