'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function BreakMenu() {
  const [best, setBest] = useState({ breakout: null, invaders: null })

  useEffect(() => {
    Promise.all([
      fetch('/api/scores?game=breakout', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/scores?game=invaders', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([b, i]) => {
        setBest({
          breakout: b.scores?.[0]?.score ?? null,
          invaders: i.scores?.[0]?.score ?? null,
        })
      })
      .catch(() => {})
  }, [])

  return (
    <main className="relative min-h-dvh bg-canvas">
      <nav className="flex items-center px-5 py-4">
        <Link
          href="/"
          className="text-[15px] text-neutral-400 transition hover:text-neutral-600"
        >
          Back
        </Link>
      </nav>

      <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col items-center justify-center gap-4 px-6">
        <GameCard
          href="/journal"
          title="Journal"
          subtitle="Write about your day"
        />
        <p className="mt-2 w-full text-xs uppercase tracking-widest text-neutral-300">
          Take a break
        </p>
        <GameCard
          href="/break/breakout"
          title="Breakout"
          subtitle="Bricks & paddle"
          best={best.breakout}
        />
        <GameCard
          href="/break/invaders"
          title="Space Invaders"
          subtitle="Shoot the fleet"
          best={best.invaders}
        />
      </div>
    </main>
  )
}

function GameCard({ href, title, subtitle, best }) {
  return (
    <Link
      href={href}
      className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm transition hover:shadow-md"
    >
      <div>
        <div className="text-[17px] font-light text-neutral-800">{title}</div>
        <div className="text-xs text-neutral-400">{subtitle}</div>
      </div>
      {best != null ? (
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-neutral-300">Best</div>
          <div className="tabular-nums text-neutral-500">{best}</div>
        </div>
      ) : (
        <span className="text-blue-500">→</span>
      )}
    </Link>
  )
}
