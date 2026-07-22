'use client'

// Compact top-scores list for a brain-break game. Pass the fetched scores
// array; optionally highlight the row matching `highlight` (the score just set).
export default function Leaderboard({ scores, highlight = null }) {
  if (!scores) return null
  if (scores.length === 0) {
    return (
      <p className="text-center text-sm text-neutral-300">
        No scores yet — play a round!
      </p>
    )
  }

  let highlighted = false
  return (
    <ol className="flex w-full max-w-[280px] flex-col gap-1">
      {scores.map((s, i) => {
        const isNew = !highlighted && highlight != null && s.score === highlight
        if (isNew) highlighted = true
        return (
          <li
            key={i}
            className={
              'flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ' +
              (isNew ? 'bg-blue-50 text-blue-600' : 'text-neutral-500')
            }
          >
            <span className="tabular-nums text-neutral-400">{i + 1}</span>
            <span className="tabular-nums font-medium">{s.score}</span>
            <span className="text-[11px] text-neutral-300">
              {new Date(s.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
