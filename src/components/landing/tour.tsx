import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { BackfillMock, BoardMock, FocusMock, KindsMock, RulesMock } from '~/components/landing/slides'
import { JevDemo } from '~/components/landing/jev-demo'
import { Button } from '~/components/ui/button'
import { useCarousel } from '~/hooks/use-carousel'
import { cn } from '~/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')

// `body` gets `stop`, so a slide the user plays with (the demo) can end auto-play.
const SLIDES: Array<{ tab: string; title: string; text: string; body: (stop: () => void) => ReactNode }> = [
  {
    tab: 'Focus',
    title: 'Only what needs you.',
    text: 'Focus shows the mail that needs you across every inbox. Everything else is filed, never thrown away.',
    body: () => <FocusMock />,
  },
  {
    tab: "Jev's read",
    title: 'One email, one call, every answer.',
    text: 'Jev answers where it belongs, how soon it needs you, what kind it is, and a yes or no for each of your own rules. Pick an example.',
    body: (stop) => <JevDemo onPick={stop} />,
  },
  {
    tab: 'The board',
    title: 'Four columns. One decision per email.',
    text: 'Needs action and Goal show in Focus. Info and Spam are archived and labelled in Gmail, so your Gmail inbox gets quieter too.',
    body: () => <BoardMock />,
  },
  {
    tab: 'Six kinds',
    title: 'Six kinds of email, each with a confidence.',
    text: 'Filter any view by kind, or add your own labels on top.',
    body: () => <KindsMock />,
  },
  {
    tab: 'Your rules',
    title: 'Teach it what matters, in plain words.',
    text: 'Goals, workflows and labels ride along in the same call. Filters skip the model entirely when you already know the answer.',
    body: () => <RulesMock />,
  },
  {
    tab: 'Backfill',
    title: 'And the mail you already have.',
    text: 'Backfill sorts old mail in batches, with live progress you can pause, resume and retry. Labels and status are mirrored back to Gmail as it goes.',
    body: () => <BackfillMock />,
  },
]

// The product tour: one carousel instead of a long page of sections.
export const Tour = () => {
  const { index, stopped, height, regionRef, slideRef, go, stop, toggle, hold, release } = useCarousel(SLIDES.length)

  return (
    <section id="tour" className="scroll-mt-6 px-6 pb-20 md:pb-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
            {SLIDES.map((s, i) => (
              <button
                key={s.tab}
                type="button"
                aria-pressed={i === index}
                onClick={() => go(i)}
                className={cn(
                  'h-9 rounded-lg px-3.5 text-[13px] font-semibold transition-colors',
                  i === index ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.tab}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1.5 font-mono text-xs text-muted-foreground">
              {pad(index + 1)} / {pad(SLIDES.length)}
            </span>
            <Button
              variant="outline"
              size="icon-lg"
              onClick={toggle}
              aria-label={stopped ? 'Play the tour' : 'Pause the tour'}
            >
              {stopped ? <Play /> : <Pause />}
            </Button>
            <Button variant="outline" size="icon-lg" onClick={() => go(index - 1)} aria-label="Previous slide">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-lg" onClick={() => go(index + 1)} aria-label="Next slide">
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div
          role="region"
          ref={regionRef}
          aria-roledescription="carousel"
          aria-label="Product tour"
          onMouseEnter={hold}
          onMouseLeave={release}
          onFocus={hold}
          onBlur={release}
          className="overflow-hidden rounded-2xl border bg-muted/60"
        >
          {/* Follows the current slide's height, so short slides don't leave a gap. */}
          <div
            className="overflow-hidden transition-[height] duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
            style={{ height }}
          >
            <div
              aria-live={stopped ? 'polite' : 'off'}
              className="flex items-start transition-transform duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {SLIDES.map((s, i) => (
                <div
                  key={s.tab}
                  ref={slideRef(i)}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${SLIDES.length}: ${s.tab}`}
                  // Off-screen slides turn invisible once the slide-out finishes, so Tab can't reach them.
                  className={cn(
                    'flex w-full shrink-0 flex-col gap-6 p-5 transition-[visibility] duration-700 sm:p-8 lg:p-10',
                    i !== index && 'invisible',
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">{s.title}</h2>
                    <p className="min-w-0 flex-[1_1_22rem] text-muted-foreground">{s.text}</p>
                  </div>
                  {s.body(stop)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
