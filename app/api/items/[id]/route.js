import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DELETE /api/items/:id -> hard delete (permanent). Used by the Done screen's
// "Delete Forever" action.
export async function DELETE(_req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  const { error } = await supabase.from('items').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
