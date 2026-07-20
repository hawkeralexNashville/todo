// Pure helpers for the time-estimate + work-timer feature. No server/browser
// specifics, so both client components and route handlers can import them.

// Parse a user-typed estimate into seconds, or null if empty/invalid.
//   "1:00" -> 3600   "0:30" -> 1800   "1:30" -> 5400
//   "30"   -> 1800   (a bare number is minutes)
// Returns null for 0 or blank so "no estimate" and "zero" are the same thing.
export function parseEstimate(input) {
  if (typeof input !== 'string') return null
  const str = input.trim()
  if (!str) return null

  let seconds
  if (str.includes(':')) {
    const [h, m] = str.split(':')
    const hours = parseInt(h, 10) || 0
    const mins = parseInt(m, 10) || 0
    seconds = hours * 3600 + mins * 60
  } else {
    const mins = parseInt(str, 10)
    if (Number.isNaN(mins)) return null
    seconds = mins * 60
  }
  return seconds > 0 ? seconds : null
}

// Format a duration (seconds) as "H:MM" for estimates and totals.
//   1800 -> "0:30"   3600 -> "1:00"   5400 -> "1:30"
export function formatDuration(seconds) {
  if (seconds == null) return ''
  const totalMin = Math.round(seconds / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// Format a live countdown (seconds) as a clock. Shows H:MM:SS once past an
// hour, otherwise M:SS. Negative values (overtime) get a leading "-".
export function formatClock(seconds) {
  const neg = seconds < 0
  let s = Math.abs(Math.floor(seconds))
  const h = Math.floor(s / 3600)
  s %= 3600
  const m = Math.floor(s / 60)
  const sec = s % 60
  const body =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`
  return (neg ? '-' : '') + body
}

// Actual time spent on an item so far, in seconds, including the currently
// running segment if the timer is active.
export function elapsedSeconds(item, nowMs = Date.now()) {
  const spent = item.time_spent || 0
  if (item.timer_started_at) {
    const startMs = new Date(item.timer_started_at).getTime()
    return spent + Math.max(0, (nowMs - startMs) / 1000)
  }
  return spent
}

// Seconds remaining against the estimate (negative once in overtime).
export function remainingSeconds(item, nowMs = Date.now()) {
  return (item.time_estimate || 0) - elapsedSeconds(item, nowMs)
}
