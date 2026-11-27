import { createFileRoute } from '@tanstack/react-router'

const SITE = 'https://email-bro.428.lol'
const GITHUB_URL = 'https://github.com/saranatour1/Email-bro'

const LLMS_TXT = `# Email Bro

> Email Bro puts several Gmail accounts, and optionally an address on your own domain, into one inbox. Jev, an AI model, sorts every incoming email, so the default Focus view shows only the mail that needs you.

Email Bro is open source and built on Convex and TanStack Start. It stores as little as possible: for Gmail, only the message id, the subject and the sender's name. An email's body is fetched from Gmail when you open it and is never saved.

## How it sorts mail

- Needs action: you have to reply, pay, sign, confirm or decide something.
- Goal: it moves one of your goals forward, like "Find a new job".
- Info: receipts, updates and newsletters, with nothing for you to do.
- Spam: scams, cold sales and bulk mail you never asked for.

## Features

- Goals: related mail stays in front of you.
- Filters: exact rules, like Gmail filters ("anything from this sender goes to Info").
- Workflows: describe a kind of email in plain words and choose where it goes. The app can suggest workflows from your own mail.
- Backfill: sort older mail with live progress you can pause, resume and retry.

## Privacy

- Kept: the message id, the subject and the sender's name.
- Not kept: bodies, addresses, attachments and AI summaries.
- Deleting: never. Done, Spam and filing archive the email in Gmail, and the app only asks for the gmail.modify scope, which can't permanently delete.
- Sending: only when you press Send. No auto-replies.
- Your domain: mail on your own domain has no Gmail copy to fetch, so it is stored encrypted with a key unique to you.
- Jev runs with zero data retention, so the model provider doesn't keep a copy of your email.

## Links

- [Email Bro](${SITE}/): the landing page
- [Get started](${SITE}/mail/focus): sign in with Google
- [Source code](${GITHUB_URL}): the README covers setup and the full privacy details
`

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: { GET: () => new Response(LLMS_TXT, { headers: { 'content-type': 'text/plain; charset=utf-8' } }) },
  },
})
