import { createFileRoute } from '@tanstack/react-router'
import { Landing } from '~/components/landing/landing'

// The public landing page. It needs no session, so it renders on the server like any marketing page.
export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Email Bro: all your inboxes, sorted' },
      {
        name: 'description',
        content:
          'Email Bro puts your Gmail accounts and your own domain in one place. Jev sorts every email, so Focus shows only what needs you.',
      },
    ],
  }),
  component: Landing,
})
