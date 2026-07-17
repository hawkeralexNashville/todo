import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { runDailyReset, logicalDay } from '@/lib/reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/items/summary -> { total, completed } for today's priority queue.
//
// total     = prioritized items still active, plus prioritized items
//             completed today (evergreen done_today or one-off deleted today).
// completed = the subset of those completed today.
//
// Items completed on a previous day (a one-off finished yesterday, or an
// evergreen before its reset) fall out of "today" automatically once their
// completed_at no longer matches today's logical day.
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
  let total = 0
  let completed = 0

  for (const it of data) {
    if (it.status === 'active') {
      total++
    } else if (it.status === 'done_today' || it.status === 'deleted') {
      if (it.completed_at && logicalDay(new Date(it.completed_at)) === today) {
        total++
        completed++
      }
    }
  }

  return NextResponse.json({ total, completed })
}
