import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/priority  body: { ids: [id, ...], locked: [id, ...] }
// Sets the entire priority queue in one shot: every active item is demoted and
// unlocked, then the listed items are promoted in order (position = index) and
// the `locked` subset is pinned. Promotes, demotes, reorders, and lock changes
// all collapse into this single call. `ids` is expected already normalized
// (locked items first), so position order matches display order.
export async function POST(req) {
  const supabase = getSupabase()

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const ids = Array.isArray(body.ids) ? body.ids : null
  if (!ids) {
    return NextResponse.json({ error: 'ids array required.' }, { status: 400 })
  }
  const lockedSet = new Set(Array.isArray(body.locked) ? body.locked : [])

  // Demote + unlock every currently-prioritized item first, then re-apply the
  // listed ones. We match on prioritized/locked (not status) so items already
  // completed today — which stay in the queue, shown as done — reorder and
  // drop off consistently too.
  const { error: demoteError } = await supabase
    .from('items')
    .update({ prioritized: false, locked: false })
    .or('prioritized.eq.true,locked.eq.true')
  if (demoteError) {
    return NextResponse.json({ error: demoteError.message }, { status: 500 })
  }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from('items')
      .update({ prioritized: true, position: i, locked: lockedSet.has(ids[i]) })
      .eq('id', ids[i])
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
