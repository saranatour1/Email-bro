import { ConvexError } from 'convex/values'
import { env } from '../_generated/server'

type Email = { from: string; to: Array<string>; subject: string; text: string; headers?: Record<string, string> }

// Sends one email through Resend with the deployment's key.
export const resendEmail = async (email: Email) => {
  if (!env.RESEND_API_KEY) throw new ConvexError('RESEND_API_KEY is not set')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email),
  })
  if (!res.ok) throw new ConvexError(`Send failed (${res.status}): ${await res.text()}`)
}
