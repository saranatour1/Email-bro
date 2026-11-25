import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import auth from '@convex-dev/auth/convex.config.js'
import google from '@convex-dev/auth/components/google/convex.config.js'
import workflow from '@convex-dev/workflow/convex.config.js'
import batchWorker from '@convex-dev/batch-worker/convex.config.js'
import shardedCounter from '@convex-dev/sharded-counter/convex.config.js'
import cloudflareEmail from '@sarant/cloudflare-email-component/convex.config.js'

const app = defineApp({
  env: {
    // One Google OAuth client serves both the master login and Gmail connect.
    GOOGLE_CLIENT_ID: v.string(),
    GOOGLE_CLIENT_SECRET: v.string(),
    // The frontend origin, e.g. http://localhost:3000. Optional so a new preview deployment can take its first push
    // before scripts/cloudflare-preview.sh sets it.
    SITE_URL: v.optional(v.string()),
    // Never leaves the deployment: each user's inbound Worker gets its own secret derived from it. The shared Worker
    // in workers/inbound may still send it as is.
    INBOUND_SECRET: v.optional(v.string()),
    // Outbound through Resend for your own domain. Cloudflare sending uses each user's own account instead.
    RESEND_API_KEY: v.optional(v.string()),
    // Sender of account notices, sent through Resend, e.g. "Email Bro <hello@yourdomain.com>". Without it (or
    // RESEND_API_KEY), an account is still deleted but no confirmation email goes out.
    NOTICE_FROM: v.optional(v.string()),
    // AES-256 key (base64url). Each user's data is encrypted with a key derived from it. Never in the database.
    MAIL_ENCRYPTION_KEY: v.optional(v.string()),
    // Secret for the HMAC refs shown instead of real email ids on the backfill tab. Set your own.
    ID_HASH_KEY: v.string(),
  },
})

app.use(auth)

app.use(google, {
  httpPrefix: '/oauth/google',
  env: { CLIENT_ID: app.env.GOOGLE_CLIENT_ID, CLIENT_SECRET: app.env.GOOGLE_CLIENT_SECRET },
})

app.use(workflow)
app.use(batchWorker)
app.use(shardedCounter)
// Sends with each user's own Cloudflare credentials, passed per call. No httpPrefix: its routes check one
// deployment-wide secret, so inbound mail comes through /inbound/email with a secret per user instead.
app.use(cloudflareEmail)

export default app
