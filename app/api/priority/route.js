import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/priority  body: { ids: [id, id, ...] }
// Sets the entire priority queue in one shot: every active item is demoted to
// the backlog, then the listed items are promoted in order (position = index).
// Promotes, demotes, and reorders all collapse into this single call.
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

  // Demote every active item first (backlog), then promote the listed ones.
  const { error: demoteError } = await supabase
    .from('items')
    .update({ prioritized: false })
    .eq('status', 'active')
  if (demoteError) {
    return NextResponse.json({ error: demoteError.message }, { status: 500 })
  }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from('items')
      .update({ prioritized: true, position: i })
      .eq('id', ids[i])
      .eq('status', 'active')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
