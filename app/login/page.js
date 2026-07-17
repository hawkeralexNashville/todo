'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        setError('Wrong password.')
        setBusy(false)
        return
      }
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next') || '/'
      window.location.href = next
    } catch {
      setError('Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col items-center">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="w-full border-0 border-b border-neutral-200 bg-transparent pb-2 text-center text-lg text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
        />
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-8 text-[15px] text-blue-500 transition disabled:opacity-30"
        >
          {busy ? 'Unlocking…' : 'Enter'}
        </button>
        {error ? (
          <p className="mt-4 text-sm text-neutral-400">{error}</p>
        ) : null}
      </form>
    </main>
  )
}
