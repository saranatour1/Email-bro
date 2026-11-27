import { trackAgents } from '@databuddy/sdk/agents'
import handler from '@tanstack/react-start/server-entry'

type Env = { DATABUDDY_WEBSITE_ID: string }
type Context = { waitUntil: (promise: Promise<unknown>) => void }

export default {
  fetch: (request: Request, env: Env, ctx: Context) => {
    ctx.waitUntil(trackAgents(request, { websiteId: env.DATABUDDY_WEBSITE_ID }))
    return handler.fetch(request)
  },
}
