import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/items/:id/skip -> mark an active item as skipped right now.
// The skip lasts only for its logical day (cleared at the 4 AM daily reset),
// so the item returns to its normal priority spot tomorrow.
export async function POST(_req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  const { error } = await supabase
    .from('items')
    .update({ skipped_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'active')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
