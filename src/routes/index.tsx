import { createFileRoute } from '@tanstack/react-router'
import { Landing } from '~/components/landing/landing'

const TITLE = 'Email Bro: all your inboxes, sorted'
const DESCRIPTION =
  'Email Bro puts your Gmail accounts and your own domain in one place. Jev sorts every email, so Focus shows only what needs you.'
// Link previews need absolute URLs.
const SITE = 'https://email-bro.428.lol'

// The public landing page. It needs no session, so it renders on the server like any marketing page.
export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE}/` },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:image', content: `${SITE}/og.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Email Bro: All your inboxes. Only what needs you.' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Landing,
})
