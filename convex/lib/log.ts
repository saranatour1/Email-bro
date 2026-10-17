import { createLogger, initLogger } from 'evlog'
import { env } from '../_generated/server'

// Structured "wide events" in the Convex logs: one JSON event per unit of work. Ids, counts and
// decisions only; never email content.
// `environment` is the deployment name (e.g. zany-alpaca-474), so dev and prod events are easy to tell apart.
initLogger({
  env: { service: 'email-bro', environment: new URL(env.CONVEX_CLOUD_URL).hostname.split('.')[0] },
  pretty: false,
})

export const wideEvent = createLogger

// The HTTP status in an API error message (e.g. Gmail's 403 quota error), without the message itself.
export const errorKind = (e: unknown) => {
  const message = e instanceof Error ? e.message : String(e)
  return message.match(/\b([45]\d\d)\b/)?.[1] ?? (e instanceof Error ? e.name : 'unknown')
}
