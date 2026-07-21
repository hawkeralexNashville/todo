'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/Modal'
import { formatClock, remainingSeconds, elapsedSeconds } from '@/lib/time'

export default function Home() {
  const [items, setItems] = useState(null) // null = loading; array in position order
  const [buckets, setBuckets] = useState([])
  const [summary, setSummary] = useState(null) // { total, completed } for today
  const [exiting, setExiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [ri, rb, rs] = await Promise.all([
      fetch('/api/items', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/buckets', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/items/summary', { cache: 'no-store' }).then((r) => r.json()),
    ])
    setItems(ri.items || [])
    setBuckets(rb.buckets || [])
    setSummary(rs)
  }

  const bucketNameById = useMemo(() => {
    const m = new Map()
    for (const b of buckets) m.set(b.id, b.name)
    return m
  }, [buckets])

  // Today's queue: only prioritized, still-active items (the backlog stays
  // off Home, and anything already completed today should not resurface).
  // Non-skipped first in priority order, then items skipped today (oldest skip
  // first) so you always cycle back to them.
  const queue = useMemo(() => {
    if (!items) return []
    const pri = items
      .filter((i) => i.prioritized && !i.done)
      .sort((a, b) => a.position - b.position)
    const active = pri.filter((i) => !i.skipped)
    const skipped = pri
      .filter((i) => i.skipped)
      .sort((a, b) => (a.skipped_at || '').localeCompare(b.skipped_at || ''))
    return [...active, ...skipped]
  }, [items])

  const current = queue.length > 0 ? queue[0] : null
  const timerRunning = !!(current && current.timer_started_at)
  // Flow mode: off until you manually Start once, then each new item's timer
  // auto-starts on advance; pressing Pause turns it back off. Resets on reload.
  const [autoStart, setAutoStart] = useState(false)
  const [pending, setPending] = useState(null) // 'done' | 'skip' | null — for the spinner

  // Estimated time still needed to finish everything queued: for each not-done
  // prioritized item, estimate minus time already spent (never below zero).
  // Ticks down live while a timer runs; a task's remaining share drops off the
  // moment it's marked done.
  const timeLeft = useMemo(() => {
    if (!items) return 0
    return items
      .filter((i) => i.prioritized && !i.done)
      .reduce(
        (sum, i) => sum + Math.max(0, (i.time_estimate || 0) - elapsedSeconds(i, nowMs)),
        0,
      )
  }, [items, nowMs])

  // Tick every second so the countdown, time-left, and finish clock stay live.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Flow mode: when a new item comes up and we're in flow, auto-start its timer.
  const currentId = current?.id
  useEffect(() => {
    if (!autoStart || !current) return
    if (!current.time_estimate || current.timer_started_at) return
    timerAction('start')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, autoStart])

  // Patch the current item's timer fields locally + persist the action.
  async function timerAction(action) {
    if (!current) return
    const id = current.id
    if (action === 'start') setAutoStart(true)
    if (action === 'pause') setAutoStart(false)
    setItems((prev) =>
      prev
        ? prev.map((i) => {
            if (i.id !== id) return i
            if (action === 'start') return { ...i, timer_started_at: new Date().toISOString() }
            if (action === 'pause') {
              const start = i.timer_started_at ? new Date(i.timer_started_at).getTime() : null
              const extra = start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0
              return { ...i, time_spent: (i.time_spent || 0) + extra, timer_started_at: null }
            }
            if (action === 'reset') return { ...i, time_spent: 0, timer_started_at: null }
            return i
          })
        : prev,
    )
    setNowMs(Date.now())
    try {
      await fetch(`/api/items/${id}/timer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    } catch {
      // best-effort; a reload resyncs
    }
  }

  function fadeThen(update) {
    setBusy(true)
    setExiting(true)
    setTimeout(() => {
      update()
      setExiting(false)
      setBusy(false)
      setPending(null)
      setShowDetail(false) // next item starts collapsed
    }, 220)
  }

  // Both Done and Skip advance optimistically: we disable the button + show a
  // spinner instantly, move to the next item right away, and fire the save in
  // the background (a reload resyncs if it ever fails). No waiting on the
  // round-trip, and no chance of a double-click registering.
  function markDone() {
    if (!current || busy) return
    const id = current.id
    setPending('done')
    setSummary((s) => (s ? { ...s, completed: s.completed + 1 } : s))
    fetch(`/api/items/${id}/done`, { method: 'POST' }).catch(() => {})
    fadeThen(() =>
      setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev)),
    )
  }

  function skip() {
    if (!current || busy) return
    const id = current.id
    const now = new Date().toISOString()
    setPending('skip')
    fetch(`/api/items/${id}/skip`, { method: 'POST' }).catch(() => {})
    fadeThen(() =>
      setItems((prev) =>
        prev
          ? prev.map((i) =>
              i.id === id ? { ...i, skipped: true, skipped_at: now } : i,
            )
          : prev,
      ),
    )
  }

  return (
    <main className="relative min-h-dvh bg-canvas">
      {/* Unobtrusive top-corner controls */}
      <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-neutral-300">
        <Link
          href="/organize"
          aria-label="Organize and prioritize"
          className="p-1 transition hover:text-neutral-500"
        >
          <OrganizeGlyph />
        </Link>
        <Link
          href="/done"
          aria-label="Done items"
          className="p-1 transition hover:text-neutral-500"
        >
          <DoneGlyph />
        </Link>
      </nav>

      <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        {items === null ? null : current ? (
          <div
            key={current.id}
            className={
              'fade-in transition-all duration-200 ease-out ' +
              (exiting ? 'opacity-0 translate-y-1' : 'opacity-100')
            }
          >
            <h1 className="max-w-2xl text-4xl font-light leading-tight tracking-tight text-neutral-800 sm:text-5xl">
              {current.name}
            </h1>
            <p className="mt-3 text-xs uppercase tracking-widest text-neutral-400">
              {bucketNameById.get(current.bucket_id) || 'Uncategorized'}
            </p>
            {current.description ? (
              <button
                onClick={() => setShowDetail(true)}
                className="mt-2 text-xs text-blue-500 transition hover:text-blue-600"
              >
                Detail
              </button>
            ) : null}

            {current.time_estimate ? (
              <div className="mt-8 flex flex-col items-center gap-3">
                {(() => {
                  const remaining = remainingSeconds(current, nowMs)
                  return (
                    <span
                      className={
                        'font-light tabular-nums ' +
                        (remaining < 0
                          ? 'text-3xl text-red-400'
                          : 'text-3xl text-neutral-500')
                      }
                    >
                      {formatClock(remaining)}
                    </span>
                  )
                })()}
                <div className="flex items-center gap-4">
                  {timerRunning ? (
                    <button
                      onClick={() => timerAction('pause')}
                      className="rounded-full px-4 py-1.5 text-[13px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => timerAction('start')}
                      className="rounded-full bg-neutral-100 px-4 py-1.5 text-[13px] text-neutral-600 transition hover:bg-neutral-200"
                    >
                      Start
                    </button>
                  )}
                  {current.time_spent || current.timer_started_at ? (
                    <button
                      onClick={() => timerAction('reset')}
                      className="text-[13px] text-neutral-300 transition hover:text-neutral-500"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-10 flex items-center justify-center gap-3">
              <Link
                href="/add"
                className="rounded-full px-5 py-2.5 text-[15px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 active:bg-neutral-200"
              >
                Add
              </Link>
              <button
                onClick={skip}
                disabled={busy}
                className="flex items-center justify-center rounded-full px-5 py-2.5 text-[15px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 active:bg-neutral-200 disabled:opacity-60"
              >
                {pending === 'skip' ? <Spinner className="text-neutral-400" /> : 'Skip'}
              </button>
              <button
                onClick={markDone}
                disabled={busy}
                className="flex min-w-[84px] items-center justify-center rounded-full bg-blue-50 px-6 py-2.5 text-[15px] font-medium text-blue-600 transition hover:bg-blue-100 active:bg-blue-200 disabled:opacity-100"
              >
                {pending === 'done' ? <Spinner className="text-blue-600" /> : 'Done'}
              </button>
            </div>
          </div>
        ) : (
          <div className="fade-in">
            <p className="text-2xl font-light text-neutral-300">Nothing queued</p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Link
                href="/add"
                className="rounded-full px-5 py-2.5 text-[15px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 active:bg-neutral-200"
              >
                Add
              </Link>
              <Link
                href="/organize"
                className="rounded-full bg-blue-50 px-6 py-2.5 text-[15px] font-medium text-blue-600 transition hover:bg-blue-100 active:bg-blue-200"
              >
                Organize
              </Link>
            </div>
          </div>
        )}
      </div>

      {(() => {
        const parts = []
        if (summary && summary.total > 0) {
          parts.push(`${summary.completed}/${summary.total} complete`)
        }
        if (timeLeft > 0) {
          parts.push(`${formatClock(timeLeft)} left`)
          // Projected finish (Central time) if you worked straight through from now.
          const finish = new Date(nowMs + timeLeft * 1000)
          const label = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          }).format(finish)
          parts.push(`finish ${label}`)
        }
        return parts.length ? (
          <p className="absolute inset-x-0 bottom-8 text-center text-xs tabular-nums text-neutral-300">
            {parts.join('  ·  ')}
          </p>
        ) : null
      })()}

      <Modal open={showDetail} onClose={() => setShowDetail(false)}>
        {current ? (
          <div>
            <p className="mb-3 text-[15px] font-light text-neutral-800">
              {current.name}
            </p>
            <p className="whitespace-pre-wrap text-[15px] font-light leading-relaxed text-neutral-600">
              {current.description}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowDetail(false)}
                className="text-[15px] text-blue-500 transition hover:text-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </main>
  )
}

function Spinner({ className = 'text-blue-600' }) {
  return (
    <svg
      className={'h-[18px] w-[18px] animate-spin ' + className}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Saving"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function OrganizeGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="12" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="4" y="11.5" width="12" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function DoneGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
