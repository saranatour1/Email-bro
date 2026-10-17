import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import auth from '@convex-dev/auth/convex.config.js'
import google from '@convex-dev/auth/components/google/convex.config.js'
import workflow from '@convex-dev/workflow/convex.config.js'
import batchWorker from '@convex-dev/batch-worker/convex.config.js'
import shardedCounter from '@convex-dev/sharded-counter/convex.config.js'

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    // One Google OAuth client serves both the master login and Gmail connect.
    GOOGLE_CLIENT_ID: v.string(),
    GOOGLE_CLIENT_SECRET: v.string(),
    // The frontend origin, e.g. http://localhost:3000.
    SITE_URL: v.string(),
    // Shared secret the Cloudflare Email Worker sends with each inbound message.
    INBOUND_SECRET: v.optional(v.string()),
    // Outbound for your own domain: Cloudflare Email Sending or Resend.
    CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_EMAIL_TOKEN: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    // AES-256 key (base64url) for domain mail at rest. Lives only here, never in the database.
    MAIL_ENCRYPTION_KEY: v.optional(v.string()),
    // Secret for the HMAC refs shown instead of real email ids on the backfill tab. Set your own.
    ID_HASH_KEY: v.string(),
  },
})

app.use(auth, {
  httpPrefix: '/auth',
  env: { AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY, AUTH_JWKS: app.env.AUTH_JWKS },
})

app.use(google, {
  httpPrefix: '/oauth/google',
  env: { CLIENT_ID: app.env.GOOGLE_CLIENT_ID, CLIENT_SECRET: app.env.GOOGLE_CLIENT_SECRET },
})

app.use(workflow)
app.use(batchWorker)
app.use(shardedCounter)

export default app
