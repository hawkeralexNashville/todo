import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { runDailyReset, logicalDay, getLastResetAt } from '@/lib/reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/items/summary -> { total, completed } for the current cycle.
//
// total     = prioritized items still active, plus prioritized items
//             completed since the last reset (evergreen done_today, or a
//             one-off finished since then).
// completed = the subset of those completed since the last reset.
//
// This mirrors GET /api/items exactly, so the Home counter always agrees
// with what Organize shows as green/checked: a manual Reset click ages a
// finished one-off out of both at the same moment.
export async function GET() {
  const supabase = getSupabase()
  await runDailyReset(supabase)

  const { data, error } = await supabase
    .from('items')
    .select('status, completed_at')
    .eq('prioritized', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const today = logicalDay()
  const lastResetAt = await getLastResetAt(supabase)
  let total = 0
  let completed = 0

  for (const it of data) {
    if (it.status === 'active') {
      total++
    } else if (it.status === 'done_today') {
      total++
      completed++
    } else if (it.status === 'deleted' && it.completed_at) {
      const completedAt = new Date(it.completed_at)
      const isRecent = lastResetAt
        ? completedAt > lastResetAt
        : logicalDay(completedAt) === today
      if (isRecent) {
        total++
        completed++
      }
    }
  }

  return NextResponse.json({ total, completed })
}
