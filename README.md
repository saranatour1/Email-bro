<p align="center">
  <img src="public/favicon.svg" alt="Email Bro logo" width="88" height="88" />
</p>

<h1 align="center">Email Bro</h1>

<p align="center">All your inboxes in one place, sorted for you. Only what matters ends up on top.</p>

---

## What it is

Email Bro is an email app that puts several Gmail accounts (and, optionally, an address on your own domain) into one inbox.

When a new email arrives, an AI reads it and puts it in one of four columns:

| Column           | What goes there                                            |
| ---------------- | ---------------------------------------------------------- |
| **Needs action** | You have to reply, pay, sign, confirm or decide something. |
| **Goal**         | It moves one of your goals forward, like "Find a new job". |
| **Info**         | Receipts, updates, newsletters: nothing you need to do.    |
| **Spam**         | Scams, cold sales and bulk mail you never asked for.       |

You can also:

- **Set goals** so related mail stays in front of you.
- **Add filters**, like Gmail filters, for exact rules ("anything from this sender goes to Info").
- **Create workflows**: describe a kind of email in plain words and choose where it goes. The app can suggest workflows from your own mail.
- **Backfill** older mail with a live view of the progress, which you can pause, resume and retry.

## Privacy

Email Bro stores as little as possible. For Gmail it keeps only the sender's name, the subject and the message ids. It fetches the email itself from Gmail when you open it. Mail sent to your own domain has to be stored, so it is kept encrypted.

## Built with

[Convex](https://convex.dev) (backend, auth, workflows) · [TanStack Start](https://tanstack.com/start) · React · Tailwind CSS · shadcn/ui · the Vercel AI SDK through the Convex AI Gateway

## Run it locally

### What you need

- Node.js 22.6 or newer and [pnpm](https://pnpm.io)
- A free [Convex](https://convex.dev) account
- A Google Cloud project with the **Gmail API** turned on and an **OAuth client** (type "Web application")

### 1. Install

```bash
pnpm install
```

### 2. Create your Convex backend

```bash
npx convex dev --once
```

This asks you to log in, creates a development deployment and writes its URL to `.env.local`.

### 3. Set the backend settings

Create the sign-in keys:

```bash
node -e "const {generateKeyPairSync}=require('crypto');const k=generateKeyPairSync('rsa',{modulusLength:2048});console.log('AUTH_PRIVATE_KEY='+k.privateKey.export({type:'pkcs8',format:'pem'}).trim().replace(/\n/g,' '));console.log('AUTH_JWKS='+JSON.stringify({keys:[{use:'sig',alg:'RS256',...k.publicKey.export({format:'jwk'})}]}))"
```

Then set each value on your deployment. Use the `NAME=value` form, so values that start with `-` still work:

```bash
npx convex env set "AUTH_PRIVATE_KEY=<value from above>"
```

| Setting                                                               | Required            | What it is                                                            |
| --------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS`                                       | yes                 | The sign-in keys from the command above                               |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                            | yes                 | Your Google OAuth client, used for both sign-in and connecting Gmail  |
| `SITE_URL`                                                            | yes                 | Where the app runs, e.g. `http://localhost:3000`                      |
| `ID_HASH_KEY`                                                         | yes                 | Any long random string, e.g. from `openssl rand -base64 32`           |
| `MAIL_ENCRYPTION_KEY`                                                 | for your own domain | A 32-byte key: `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='` |
| `INBOUND_SECRET`                                                      | for your own domain | A shared secret for the email worker                                  |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN` or `RESEND_API_KEY` | for your own domain | Sending mail from your domain                                         |

### 4. Point Google back at your app

In your Google OAuth client, add your Convex **site** URL (it ends in `.convex.site`) as an authorized redirect URI, with these two paths:

- `/gmail/callback` (connecting a Gmail account)
- the sign-in callback under `/oauth/google`. If Google shows `redirect_uri_mismatch` on first sign-in, the error page shows the exact URL to add.

### 5. Start it

```bash
pnpm dev
```

Open http://localhost:3000, sign in with Google, and connect your Gmail accounts from **Mailboxes**.

### Optional: an address on your own domain

`workers/inbound` is a small Cloudflare Email Worker that forwards mail sent to your domain into Email Bro. Set its `CONVEX_SITE_URL` to your deployment's site URL and its secret to the same `INBOUND_SECRET`, then deploy it with Wrangler.

## Useful commands

| Command      | What it does                              |
| ------------ | ----------------------------------------- |
| `pnpm dev`   | Runs the backend and the web app together |
| `pnpm lint`  | Type checks and lints                     |
| `pnpm test`  | Runs the tests                            |
| `pnpm build` | Builds the app for production             |

Project rules for contributors are in [`GUIDELINES.md`](GUIDELINES.md).
