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
  // Finalize a running timer so the last segment is captured in time_spent.
  if (item.timer_started_at) {
    const startMs = new Date(item.timer_started_at).getTime()
    const extra = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
    updates.time_spent = (item.time_spent || 0) + extra
    updates.timer_started_at = null
  }

  const { error } = await supabase.from('items').update(updates).eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
