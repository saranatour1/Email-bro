import { useEffect, useRef, useState } from 'react'

// A slide index that moves on by itself until the user takes over. It pauses while held (hover or focus) or
// scrolled out of view, and never auto-plays for people who asked their system for reduced motion.
// It also measures the current slide, so the carousel is only as tall as what it shows.
export const useCarousel = (count: number, intervalMs = 6000) => {
  const [index, setIndex] = useState(0)
  const [stopped, setStopped] = useState(false)
  const [held, setHeld] = useState(false)
  const [inView, setInView] = useState(false)
  const [height, setHeight] = useState<number>()
  const regionRef = useRef<HTMLDivElement>(null)
  const slides = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setStopped(true)
    const region = regionRef.current
    if (!region) return
    const observer = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
      threshold: 0.25,
    })
    observer.observe(region)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const slide = slides.current[index]
    if (!slide) return
    const observer = new ResizeObserver(() => setHeight(slide.offsetHeight))
    observer.observe(slide)
    return () => observer.disconnect()
  }, [index])

  useEffect(() => {
    if (stopped || held || !inView) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs)
    return () => clearInterval(id)
  }, [stopped, held, inView, count, intervalMs])

  const go = (i: number) => {
    setIndex((i + count) % count)
    setStopped(true)
  }

  return {
    index,
    stopped,
    height,
    regionRef,
    slideRef: (i: number) => (el: HTMLDivElement | null) => {
      slides.current[i] = el
    },
    go,
    stop: () => setStopped(true),
    toggle: () => setStopped((s) => !s),
    hold: () => setHeld(true),
    release: () => setHeld(false),
  }
}
