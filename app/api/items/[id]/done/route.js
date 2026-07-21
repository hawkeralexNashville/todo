import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/items/:id/done -> mark an item done per its type.
//   one_off   -> soft-deleted (status 'deleted'), kept for history
//   evergreen -> 'done_today', will reset to active at 4 AM local
export async function POST(_req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select('id, type, status, time_spent, timer_started_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!item) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const newStatus = item.type === 'evergreen' ? 'done_today' : 'deleted'

  const updates = {
    status: newStatus,
    completed_at: new Date().toISOString(),
  }

  // Final time actually spent (including any still-running segment).
  let finalSpent = item.time_spent || 0
  if (item.timer_started_at) {
    const startMs = new Date(item.timer_started_at).getTime()
    finalSpent += Math.max(0, Math.floor((Date.now() - startMs) / 1000))
    updates.time_spent = finalSpent
    updates.timer_started_at = null
  }

  // Self-tuning estimate: if the timer was actually used, set the estimate to
  // how long it really took (rounded to the nearest minute) so future runs of
  // an evergreen reflect reality — faster or slower. Untracked completions
  // (no time spent) leave the existing estimate untouched.
  const roundedMinutes = Math.round(finalSpent / 60)
  if (roundedMinutes >= 1) {
    updates.time_estimate = roundedMinutes * 60
  }

  const { error } = await supabase.from('items').update(updates).eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
