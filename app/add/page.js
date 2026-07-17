'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AddPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [type, setType] = useState('one_off')
  const [busy, setBusy] = useState(false)

  const [buckets, setBuckets] = useState([])
  const [bucketId, setBucketId] = useState(null) // null = Uncategorized
  const [creatingBucket, setCreatingBucket] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')

  useEffect(() => {
    fetch('/api/buckets', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setBuckets(d.buckets || []))
      .catch(() => {})
  }, [])

  async function createBucket(e) {
    e.preventDefault()
    const trimmed = newBucketName.trim()
    if (!trimmed) return
    setNewBucketName('')
    setCreatingBucket(false)
    try {
      const res = await fetch('/api/buckets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (data.bucket) {
        setBuckets((prev) => [...prev, data.bucket])
        setBucketId(data.bucket.id)
      }
    } catch {
      // ignore
    }
  }

  async function save(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, type, bucket_id: bucketId }),
      })
      router.push('/')
    } catch {
      setBusy(false)
    }
  }

  return (
    <main className="relative min-h-dvh bg-canvas">
      <nav className="absolute inset-x-0 top-0 flex items-center px-5 py-4">
        <Link
          href="/"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Cancel
        </Link>
      </nav>

      <div className="flex min-h-dvh flex-col items-center justify-center px-8">
        <form onSubmit={save} className="flex w-full max-w-sm flex-col items-center">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What needs doing?"
            aria-label="Item name"
            className="w-full border-0 border-b border-neutral-200 bg-transparent pb-2 text-center text-2xl font-light text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
          />

          <div className="mt-10 flex items-center gap-2 rounded-full bg-neutral-100 p-1">
            <TypeButton
              active={type === 'one_off'}
              onClick={() => setType('one_off')}
            >
              One-off
            </TypeButton>
            <TypeButton
              active={type === 'evergreen'}
              onClick={() => setType('evergreen')}
            >
              Evergreen
            </TypeButton>
          </div>

          {/* Bucket picker (optional). */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <BucketChip active={bucketId === null} onClick={() => setBucketId(null)}>
              No bucket
            </BucketChip>
            {buckets.map((b) => (
              <BucketChip
                key={b.id}
                active={bucketId === b.id}
                onClick={() => setBucketId(b.id)}
              >
                {b.name}
              </BucketChip>
            ))}
            {creatingBucket ? (
              <input
                autoFocus
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createBucket(e)
                  if (e.key === 'Escape') {
                    setCreatingBucket(false)
                    setNewBucketName('')
                  }
                }}
                onBlur={(e) => createBucket(e)}
                placeholder="New bucket"
                className="rounded-full border border-neutral-200 bg-transparent px-3 py-1 text-sm text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreatingBucket(true)}
                className="rounded-full px-3 py-1 text-sm text-blue-500 transition hover:text-blue-600"
              >
                + New
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="mt-12 text-[15px] text-blue-500 transition hover:text-blue-600 disabled:opacity-30"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>
    </main>
  )
}

function TypeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-5 py-1.5 text-sm transition ' +
        (active
          ? 'bg-white text-neutral-800 shadow-sm'
          : 'text-neutral-400 hover:text-neutral-600')
      }
    >
      {children}
    </button>
  )
}

function BucketChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-sm transition ' +
        (active
          ? 'border-blue-400 bg-blue-50 text-blue-600'
          : 'border-neutral-200 text-neutral-500 hover:border-neutral-300')
      }
    >
      {children}
    </button>
  )
}
