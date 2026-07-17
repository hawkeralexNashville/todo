'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Home() {
  const [items, setItems] = useState(null) // null = loading
  const [exiting, setExiting] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const res = await fetch('/api/items', { cache: 'no-store' })
    const data = await res.json()
    setItems(data.items || [])
  }

  const current = items && items.length > 0 ? items[0] : null

  async function markDone() {
    if (!current || busy) return
    setBusy(true)
    setExiting(true)
    try {
      await fetch(`/api/items/${current.id}/done`, { method: 'POST' })
    } catch {
      // If it fails, still advance the local view; a reload will resync.
    }
    // Wait for the fade-out, then advance to the next item.
    setTimeout(() => {
      setItems((prev) => (prev ? prev.slice(1) : prev))
      setExiting(false)
      setBusy(false)
    }, 220)
  }

  return (
    <main className="relative min-h-dvh bg-canvas">
      {/* Unobtrusive top-corner controls */}
      <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-neutral-300">
        <Link
          href="/reorder"
          aria-label="Reorder"
          className="p-1 transition hover:text-neutral-500"
        >
          <ReorderGlyph />
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
            <div className="mt-10 flex items-center justify-center gap-6">
              <Link
                href="/add"
                className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
              >
                Add
              </Link>
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

function DoneGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
