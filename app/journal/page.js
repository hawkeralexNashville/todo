'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function JournalPage() {
  const [today, setToday] = useState(null)
  const [day, setDay] = useState(null)
  const [content, setContent] = useState('')
  const [days, setDays] = useState([])
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    loadDay(null).then(() => setLoaded(true))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadDay(d) {
    const q = d ? `?day=${d}` : ''
    try {
      const data = await fetch(`/api/journal${q}`, { cache: 'no-store' }).then((r) => r.json())
      setToday(data.today)
      setDay(data.day)
      setContent(data.content || '')
      if (data.days) setDays(data.days)
      setStatus('idle')
    } catch {
      // ignore
    }
  }

  async function save(d, v) {
    setStatus('saving')
    try {
      await fetch('/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day: d, content: v }),
      })
      setStatus('saved')
      if (v.trim() && !days.includes(d)) setDays((prev) => [d, ...prev])
    } catch {
      setStatus('idle')
    }
  }

  function onChange(e) {
    const v = e.target.value
    setContent(v)
    setStatus('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => save(day, v), 700)
  }

  async function selectDay(d) {
    if (d === day) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      await save(day, content)
    }
    await loadDay(d)
  }

  const options = Array.from(new Set([today, ...days].filter(Boolean)))
  const words = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <nav className="flex items-center justify-between gap-3 px-5 py-4">
        <Link
          href="/break"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Menu
        </Link>
        <select
          value={day || ''}
          onChange={(e) => selectDay(e.target.value)}
          className="max-w-[55%] rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 outline-none"
        >
          {options.map((d) => (
            <option key={d} value={d}>
              {fmtDay(d, today)}
            </option>
          ))}
        </select>
      </nav>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-6">
        {loaded ? (
          <textarea
            value={content}
            onChange={onChange}
            autoFocus
            placeholder="Write about your day…"
            className="min-h-[50vh] flex-1 resize-none bg-transparent text-[17px] font-light leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-300"
          />
        ) : null}

        <div className="mt-3 flex items-center justify-between text-xs text-neutral-300">
          <span className="tabular-nums">{words} words</span>
          <span>
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
          </span>
        </div>
      </div>
    </main>
  )
}

function fmtDay(d, today) {
  if (d === today) return 'Today'
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
