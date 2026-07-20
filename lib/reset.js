// Daily reset for evergreen items.
//
// Rule: any evergreen item in "done_today" returns to "active" at 4:00 AM local
// time. We model this with a "logical day" that rolls over at 4:00 AM in the
// configured timezone:
//
//   - If the local hour is >= 4, the logical day is today's local date.
//   - If the local hour is < 4, the logical day is yesterday's local date.
//
// We store the logical day of the last reset in app_meta. On each load, if the
// current logical day differs from the stored one, we flip all done_today items
// back to active and record the new logical day. This runs the reset exactly
// once per day, on the first load after 4:00 AM local — no cron needed.

function getTimezone() {
  return process.env.APP_TIMEZONE || 'America/Chicago'
}

// Returns the logical day as a "YYYY-MM-DD" string for the given instant.
export function logicalDay(date = new Date(), tz = getTimezone()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type) => parts.find((p) => p.type === type)?.value
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(get('hour'))

  // Treat the local calendar date as UTC so we can do simple day arithmetic,
  // then shift back one day if we're in the 00:00–03:59 window.
  let d = Date.UTC(year, month - 1, day)
  if (hour < 4) {
    d -= 24 * 60 * 60 * 1000
  }
  const shifted = new Date(d)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const META_KEY = 'last_reset_day'
const META_TS_KEY = 'last_reset_at'

// The actual reset action: flip evergreens back to active, clear skip flags,
// and record the instant it happened. Shared by the automatic (time-gated)
// and manual (button) reset paths so they can never drift apart.
//
// The recorded timestamp is also how a completed one-off "ages out" of view:
// GET /api/items shows a finished one-off only if it was completed *after*
// the last reset (whichever kind), so a manual Reset makes today's finished
// one-offs disappear immediately, exactly like evergreens do — without ever
// bringing a one-off back as undone, which stays permanent.
async function applyReset(supabase) {
  await supabase
    .from('items')
    .update({
      status: 'active',
      completed_at: null,
      // Fresh timing each day for recurring items.
      time_spent: 0,
      timer_started_at: null,
    })
    .eq('status', 'done_today')

  await supabase
    .from('items')
    .update({ skipped_at: null })
    .not('skipped_at', 'is', null)

  await supabase
    .from('app_meta')
    .upsert({ key: META_TS_KEY, value: new Date().toISOString() })
}

// Runs the daily reset if needed. Idempotent within a logical day — this is
// the automatic fallback that fires on the first load after 4:00 AM local,
// regardless of whether a manual reset already ran that day.
export async function runDailyReset(supabase) {
  const today = logicalDay()

  const { data } = await supabase
    .from('app_meta')
    .select('value')
    .eq('key', META_KEY)
    .maybeSingle()

  const last = data?.value

  if (last === today) return

  await applyReset(supabase)

  await supabase.from('app_meta').upsert({ key: META_KEY, value: today })
}

// Runs the reset immediately, on demand (the Organize screen's Reset
// button). Does not touch app_meta.last_reset_day, so the automatic 4 AM
// reset still runs independently as a safety net the next calendar day.
export async function runManualReset(supabase) {
  await applyReset(supabase)
}

// The instant the last reset (automatic or manual) happened, or null if none
// has ever run yet.
export async function getLastResetAt(supabase) {
  const { data } = await supabase
    .from('app_meta')
    .select('value')
    .eq('key', META_TS_KEY)
    .maybeSingle()
  return data?.value ? new Date(data.value) : null
}
