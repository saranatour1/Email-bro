import { Link } from '@tanstack/react-router'
import { ArrowRight, Heart, Info, MessageCircle, Repeat2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Tour } from '~/components/landing/tour'
import { Logo } from '~/components/logo'
import { Button } from '~/components/ui/button'

const GITHUB_URL = 'https://github.com/saranatour1/Email-bro'
const TWEET_URL = 'https://x.com/_sarant/status/2111575095789715841'

// The public landing page at `/`. Everything links into `/mail/focus`, where the auth gate signs people in.
export const Landing = () => (
  <div className="min-h-screen bg-background text-foreground">
    <Nav />
    <main>
      <Hero />
      <Tour />
      <Story />
      <Privacy />
      <GetStarted />
    </main>
    <Footer />
  </div>
)

// Lucide dropped brand icons, so the GitHub mark is drawn here in the same stroke style.
const GithubIcon = (props: ComponentProps<'svg'>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
)

const Wordmark = () => (
  <span className="inline-flex items-center gap-2.5 font-heading font-semibold tracking-tight">
    <Logo className="size-7" />
    Email Bro
  </span>
)

const StartLink = ({ children, size = 'lg' }: { children: ReactNode; size?: 'default' | 'lg' }) => (
  <Button asChild size={size}>
    <Link to="/mail/$view" params={{ view: 'focus' }}>
      {children}
    </Link>
  </Button>
)

const Nav = () => (
  <header className="border-b">
    <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3.5">
      <a href="#top" className="mr-auto text-[17px]">
        <Wordmark />
      </a>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <a href="#tour" className="hover:text-foreground">
          Tour
        </a>
        <a href="#story" className="hover:text-foreground">
          Why
        </a>
        <a href="#privacy" className="hover:text-foreground">
          Privacy
        </a>
        <a href={GITHUB_URL} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <GithubIcon className="size-4" />
          GitHub
        </a>
      </div>
      <StartLink size="default">Get started</StartLink>
    </nav>
  </header>
)

const Hero = () => (
  <section id="top" className="px-6 pt-16 pb-12 md:pt-24 md:pb-16">
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center">
      <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-[13px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Jev reads and sorts every email the moment it arrives
      </p>
      <h1 className="max-w-4xl text-[clamp(2.5rem,6.2vw,4.75rem)] leading-[1.04] font-semibold tracking-[-0.035em]">
        All your inboxes. Only what needs you.
      </h1>
      <p className="max-w-2xl text-lg text-muted-foreground">
        Email Bro puts your Gmail accounts and your own domain in one place. Every new email is read, given a column, a
        kind and your labels, so Focus shows only the mail you have to deal with. Everything else is filed, never thrown
        away.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <StartLink>
          Get started
          <ArrowRight />
        </StartLink>
        <Button asChild size="lg" variant="outline">
          <a href="#tour">Take the tour</a>
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2 font-mono text-xs text-muted-foreground">
        <p>gmail + your own domain · never stores email bodies · never sends without you</p>
        <a href={GITHUB_URL} className="inline-flex items-center gap-1.5 text-ring hover:underline">
          <GithubIcon className="size-3.5" />
          github.com/saranatour1/Email-bro
        </a>
      </div>
    </div>
  </section>
)

// `dark` scopes the theme tokens, so this band stays dark in both themes.
const Story = () => (
  <section id="story" className="dark bg-background px-6 py-20 text-foreground md:py-28">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-12">
      <div className="flex min-w-0 flex-[1_1_26rem] flex-col gap-5">
        <p className="font-mono text-[13px] text-ring">why it exists</p>
        <h2 className="text-[clamp(2rem,4vw,3rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
          Built to dig out of 20k unread emails.
        </h2>
        <p className="text-lg text-muted-foreground">
          Five inboxes, one of them older than most apps. Built on Convex, with Jev doing the sorting and the batch
          worker component doing the heavy lifting.
        </p>
        <Button asChild size="lg" variant="outline" className="self-start">
          <a href={GITHUB_URL}>
            <GithubIcon />
            Read the code on GitHub
          </a>
        </Button>
      </div>
      <Tweet />
    </div>
  </section>
)

// A static copy of the launch tweet. X's embed script would add a third-party request, so this links out instead.
const Tweet = () => (
  <figure className="flex min-w-0 flex-[1_1_24rem] justify-center">
    <blockquote cite={TWEET_URL} className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-[17px] font-semibold">
          S
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] font-bold">Sara - @_sarant</span>
          <span className="text-sm text-muted-foreground">@_sarant</span>
        </span>
        <a href={TWEET_URL} className="ml-auto shrink-0 text-[13px] font-semibold text-ring hover:underline">
          View on X
        </a>
      </div>
      <div className="flex flex-col gap-3 text-[17px] leading-relaxed">
        <p>
          I built an email client on <Mention /> that I'll probably be the only user of.
        </p>
        <p>20k+ unread emails across 5 inboxes, one of which I've had since I was 10.</p>
        <p>
          Sometimes <Mention /> + Jev + the batch worker component is all you need.
        </p>
        <p>Big thanks to postal-mime too</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3.5 text-[13px] text-muted-foreground">
        <time dateTime="2026-10-17">Oct 17, 2026</time>
        <span className="ml-auto inline-flex items-center gap-1.5" aria-label="4 replies">
          <MessageCircle className="size-3.5" />4
        </span>
        <span className="inline-flex items-center gap-1.5" aria-label="2 reposts">
          <Repeat2 className="size-3.5" />2
        </span>
        <span className="inline-flex items-center gap-1.5" aria-label="101 likes">
          <Heart className="size-3.5" />
          101
        </span>
      </div>
    </blockquote>
  </figure>
)

const Mention = () => (
  <a href="https://x.com/convex" className="text-ring hover:underline">
    @convex
  </a>
)

const PRIVACY: Array<{ term: string; text: ReactNode }> = [
  { term: 'Kept', text: "The message id, the subject and the sender's name." },
  {
    term: 'Not kept',
    text: "Bodies, addresses, attachments and AI summaries. An email is fetched from Gmail when you open it and isn't saved.",
  },
  {
    term: 'Jev',
    text: "Runs with zero data retention (ZDR) enabled, so the model provider doesn't keep a copy of your email.",
  },
  {
    term: 'Deleting',
    text: (
      <>
        Never. Done, Spam and filing archive the email in Gmail. The app only asks for{' '}
        <code className="font-mono text-[13px]">gmail.modify</code>, which can't delete permanently.
      </>
    ),
  },
  { term: 'Sending', text: 'Only when you press Send. No auto-replies.' },
  {
    term: 'Your domain',
    text: "There's no Gmail copy to fetch, so this mail is stored encrypted with a key unique to you.",
  },
]

const Privacy = () => (
  <section id="privacy" className="px-6 py-20 md:py-28">
    <div className="mx-auto flex max-w-6xl flex-wrap gap-x-16 gap-y-8">
      <div className="flex flex-[1_1_18rem] flex-col gap-3">
        <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
          What Email Bro keeps
        </h2>
        <p className="text-muted-foreground">
          As little as it can. The details are in the{' '}
          <a href={`${GITHUB_URL}#privacy`} className="text-ring hover:underline">
            README
          </a>
          .
        </p>
      </div>
      <dl className="flex min-w-0 flex-[999_1_34rem] flex-col border-b">
        {PRIVACY.map((p) => (
          <div key={p.term} className="flex flex-wrap gap-x-6 gap-y-1 border-t py-4 text-[15px]">
            <dt className="w-30 shrink-0 font-semibold">{p.term}</dt>
            <dd className="min-w-0 flex-[1_1_20rem] text-muted-foreground">{p.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  </section>
)

const GetStarted = () => (
  <section id="start" className="px-6 pb-20 md:pb-28">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-6 rounded-3xl border bg-muted/60 px-6 py-10 sm:px-12 md:py-16">
      <div className="flex flex-[1_1_26rem] flex-col gap-3">
        <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
          Let Jev sort the next one.
        </h2>
        <p className="text-lg text-muted-foreground">Sign in with Google, connect your inboxes, and open Focus.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <StartLink>Get started</StartLink>
        <Button asChild size="lg" variant="outline">
          <a href={GITHUB_URL}>
            <GithubIcon />
            Run your own copy
          </a>
        </Button>
      </div>
      <p className="flex basis-full items-start gap-2.5 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          This is a working demo running in a real production environment. Jev runs with zero data retention (ZDR)
          enabled, so the model provider doesn't keep a copy of your email. I will never use your data against you. If
          you would like your data deleted, or have any concern about it, email me at{' '}
          <a href="mailto:reach@saranatour.dev" className="text-ring hover:underline">
            reach@saranatour.dev
          </a>{' '}
          and I will take care of it.
        </span>
      </p>
    </div>
  </section>
)

const Footer = () => (
  <footer className="border-t px-6 py-7">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-muted-foreground">
      <span className="text-foreground">
        <Wordmark />
      </span>
      <a href={GITHUB_URL} className="hover:text-foreground">
        github.com/saranatour1/Email-bro
      </a>
      <span className="ml-auto">Built with Convex, TanStack Start and the Convex AI Gateway.</span>
    </div>
  </footer>
)
