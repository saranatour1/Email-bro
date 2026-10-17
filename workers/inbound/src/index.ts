// Cloudflare Email Worker: hands every message for your domain to Convex, untouched.
// Parsing, triage and storage all happen in Convex (POST /inbound/email).

interface Env {
  CONVEX_SITE_URL: string
  INBOUND_SECRET: string
}

// The subset of Cloudflare's ForwardableEmailMessage this worker uses.
interface EmailMessage {
  from: string
  to: string
  raw: ReadableStream<Uint8Array>
  setReject: (reason: string) => void
}

export default {
  async email(message: EmailMessage, env: Env) {
    const res = await fetch(`${env.CONVEX_SITE_URL}/inbound/email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.INBOUND_SECRET}`,
        'X-Envelope-To': message.to,
        'Content-Type': 'message/rfc822',
      },
      // Buffer once: the raw stream is single-use.
      body: await new Response(message.raw).arrayBuffer(),
    })
    if (res.status === 404) return message.setReject('Unknown recipient')
    // Throwing makes Cloudflare return a temporary failure, so the sender retries instead of losing mail.
    if (!res.ok) throw new Error(`Convex inbound ${res.status}: ${await res.text()}`)
  },
}
