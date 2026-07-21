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

// --- start-of-day time (Central) ------------------------------------------

// Parse a typed start time into "HH:MM" (24h), or null.
//   "9am" -> "09:00"   "2pm" -> "14:00"   "9:30" -> "09:30"   "14:00" -> "14:00"
export function parseStartTime(input) {
  if (typeof input !== 'string') return null
  let s = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let ampm = null
  if (s.endsWith('am')) { ampm = 'am'; s = s.slice(0, -2) }
  else if (s.endsWith('pm')) { ampm = 'pm'; s = s.slice(0, -2) }
  let h, m
  if (s.includes(':')) {
    const [a, b] = s.split(':')
    h = parseInt(a, 10)
    m = parseInt(b, 10) || 0
  } else {
    h = parseInt(s, 10)
    m = 0
  }
  if (Number.isNaN(h)) return null
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// "09:00" -> "9:00 AM"
export function formatStartTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

// America/Chicago UTC offset (minutes) at the given instant. Negative.
export function centralOffsetMinutes(date = new Date()) {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      timeZoneName: 'longOffset',
    }).format(date)
    const m = s.match(/GMT([+-])(\d{2}):(\d{2})/)
    if (m) {
      const sign = m[1] === '-' ? -1 : 1
      return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
    }
  } catch {
    // fall through
  }
  return -300 // CDT fallback
}

// A Date for today's Central date at hh:mm Central, or null.
export function centralStartInstant(hhmm, now = new Date()) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t) => Number(parts.find((p) => p.type === t)?.value)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), h, m)
  const offset = centralOffsetMinutes(new Date(asUTC))
  return new Date(asUTC - offset * 60000)
}

// Format an instant as a Central clock time, e.g. "2:00 PM CDT".
export function formatCentralClock(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

// The next time it will be hh:mm Central — today if that's still ahead,
// otherwise tomorrow. Used to anchor a planning finish to the upcoming start.
export function nextStartInstant(hhmm, now = new Date()) {
  const today = centralStartInstant(hhmm, now)
  if (!today) return null
  if (today.getTime() > now.getTime()) return today
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return centralStartInstant(hhmm, tomorrow)
}

// Central calendar date "YYYY-MM-DD".
export function centralDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Like formatCentralClock, but prefixes the weekday when the finish lands on a
// different Central day than now (e.g. "Wed 9:31 AM CDT").
export function formatCentralFinish(date, now = new Date()) {
  const time = formatCentralClock(date)
  if (centralDateStr(date) === centralDateStr(now)) return time
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  }).format(date)
  return `${wd} ${time}`
}
