'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

export default function Home() {
  const [items, setItems] = useState(null) // null = loading; array in position order
  const [buckets, setBuckets] = useState([])
  const [summary, setSummary] = useState(null) // { total, completed } for today
  const [exiting, setExiting] = useState(false)
  const [busy, setBusy] = useState(false)

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
    const pri = items.filter((i) => i.prioritized && !i.done)
    const active = pri.filter((i) => !i.skipped)
    const skipped = pri
      .filter((i) => i.skipped)
      .sort((a, b) => (a.skipped_at || '').localeCompare(b.skipped_at || ''))
    return [...active, ...skipped]
  }, [items])

  const current = queue.length > 0 ? queue[0] : null

  function fadeThen(update) {
    setBusy(true)
    setExiting(true)
    setTimeout(() => {
      update()
      setExiting(false)
      setBusy(false)
    }, 220)
  }

  async function markDone() {
    if (!current || busy) return
    const id = current.id
    try {
      await fetch(`/api/items/${id}/done`, { method: 'POST' })
    } catch {
      // Advance anyway; a reload will resync.
    }
    setSummary((s) => (s ? { ...s, completed: s.completed + 1 } : s))
    fadeThen(() =>
      setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev)),
    )
  }

  async function skip() {
    if (!current || busy) return
    const id = current.id
    const now = new Date().toISOString()
    try {
      await fetch(`/api/items/${id}/skip`, { method: 'POST' })
    } catch {
      // Advance anyway; a reload will resync.
    }
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
                className="rounded-full px-5 py-2.5 text-[15px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 active:bg-neutral-200 disabled:opacity-40"
              >
                Skip
              </button>
              <button
                onClick={markDone}
                disabled={busy}
                className="rounded-full bg-blue-50 px-6 py-2.5 text-[15px] font-medium text-blue-600 transition hover:bg-blue-100 active:bg-blue-200 disabled:opacity-40"
              >
                Done
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

      {summary && summary.total > 0 ? (
        <p className="absolute inset-x-0 bottom-8 text-center text-xs text-neutral-300">
          {summary.completed}/{summary.total} complete
        </p>
      ) : null}
    </main>
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
