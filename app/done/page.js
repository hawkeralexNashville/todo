'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

export default function DonePage() {
  const [items, setItems] = useState(null)
  const [buckets, setBuckets] = useState([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [ri, rb] = await Promise.all([
      fetch('/api/items/done', { cache: 'no-store' }).then((r) => r.json()),
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

  function removeLocal(id) {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev))
  }

  return (
    <main className="relative min-h-dvh bg-canvas">
      <nav className="sticky top-0 z-10 flex items-center bg-canvas/90 px-5 py-4 backdrop-blur">
        <Link
          href="/"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Back
        </Link>
      </nav>

      <div className="mx-auto w-full max-w-md px-6 pb-24 pt-6">
        {items === null ? null : items.length === 0 ? (
          <p className="mt-24 text-center text-neutral-300">Nothing here yet</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <DoneRow
                key={item.id}
                item={item}
                bucketName={bucketNameById.get(item.bucket_id) || 'Uncategorized'}
                onDeleted={removeLocal}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function DoneRow({ item, bucketName, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function del() {
    setBusy(true)
    try {
      await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
      onDeleted(item.id)
    } catch {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <li className="flex items-center gap-4 border-b border-neutral-100 py-4">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-light text-neutral-500 line-through decoration-neutral-300">
          {item.name}
        </div>
        <div className="truncate text-xs text-neutral-300">{bucketName}</div>
      </div>
      {item.type === 'evergreen' ? (
        <span className="text-xs uppercase tracking-wide text-neutral-300">
          Today
        </span>
      ) : null}
      {confirming ? (
        <span className="flex items-center gap-3">
          <button
            onClick={del}
            disabled={busy}
            className="text-sm text-red-400 transition hover:text-red-500 disabled:opacity-40"
          >
            {busy ? 'Deleting…' : 'Sure?'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="text-sm text-neutral-300 transition hover:text-neutral-500"
          >
            No
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label="Delete forever"
          className="text-neutral-300 transition hover:text-red-400"
        >
          <TrashGlyph />
        </button>
      )}
    </li>
  )
}

function TrashGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 5h11M7 5V3.5h4V5M6 5l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
