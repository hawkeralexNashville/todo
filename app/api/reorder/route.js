import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/reorder  body: { ids: [id, id, ...] }
// Locks in a new order for the active items: position = index in the array.
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

  // Update each item's position to match its index in the submitted order.
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from('items')
      .update({ position: i })
      .eq('id', ids[i])
      .eq('status', 'active')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
