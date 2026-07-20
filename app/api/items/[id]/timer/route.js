import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/items/:id/timer  body: { action: 'start' | 'pause' | 'reset' }
//
// The timer is a real stopwatch persisted server-side so it survives
// navigation and reloads (and keeps counting while away, until paused):
//   time_spent       - accumulated seconds from finished segments
//   timer_started_at - start of the current running segment (null when paused)
//
// start: begin a running segment (no-op if already running).
// pause: fold the running segment into time_spent, stop.
// reset: clear both (back to zero, not running).
export async function POST(req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const action = body.action

  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select('time_spent, timer_started_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  if (!item) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  let updates
  if (action === 'start') {
    if (item.timer_started_at) {
      return NextResponse.json({ ok: true }) // already running
    }
    updates = { timer_started_at: new Date().toISOString() }
  } else if (action === 'pause') {
    if (!item.timer_started_at) {
      return NextResponse.json({ ok: true }) // already paused
    }
    const startMs = new Date(item.timer_started_at).getTime()
    const extra = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
    updates = {
      time_spent: (item.time_spent || 0) + extra,
      timer_started_at: null,
    }
  } else if (action === 'reset') {
    updates = { time_spent: 0, timer_started_at: null }
  } else {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  }

  const { error } = await supabase.from('items').update(updates).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...updates })
}
