'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

export default function Home() {
  const [items, setItems] = useState(null) // null = loading; array in position order
  const [buckets, setBuckets] = useState([])
  const [exiting, setExiting] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [ri, rb] = await Promise.all([
      fetch('/api/items', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/buckets', { cache: 'no-store' }).then((r) => r.json()),
    ])
    setItems(ri.items || [])
    setBuckets(rb.buckets || [])
  }

  const bucketNameById = useMemo(() => {
    const m = new Map()
    for (const b of buckets) m.set(b.id, b.name)
    return m
  }, [buckets])

  // Today's queue: non-skipped items first (in priority order), then the items
  // skipped today (oldest skip first) so you always cycle back to them.
  const queue = useMemo(() => {
    if (!items) return []
    const active = items.filter((i) => !i.skipped)
    const skipped = items
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
        <div className="flex items-center gap-1">
          <Link
            href="/reorder"
            aria-label="Reorder"
            className="p-1 transition hover:text-neutral-500"
          >
            <ReorderGlyph />
          </Link>
          <Link
            href="/organize"
            aria-label="Organize buckets"
            className="p-1 transition hover:text-neutral-500"
          >
            <OrganizeGlyph />
          </Link>
        </div>
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
            <div className="mt-10 flex items-center justify-center gap-6">
              <Link
                href="/add"
                className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
              >
                Add
              </Link>
              <button
                onClick={skip}
                disabled={busy}
                className="text-[15px] text-neutral-400 transition hover:text-neutral-600 disabled:opacity-40"
              >
                Skip
              </button>
              <button
                onClick={markDone}
                disabled={busy}
                className="text-[15px] text-blue-500 transition hover:text-blue-600 disabled:opacity-40"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="fade-in">
            <p className="text-2xl font-light text-neutral-300">Nothing to do</p>
            <div className="mt-10">
              <Link
                href="/add"
                className="text-[15px] text-blue-500 transition hover:text-blue-600"
              >
                Add
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function ReorderGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <line x1="4" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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
