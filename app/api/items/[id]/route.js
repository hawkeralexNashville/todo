import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/items/:id  body: { type: 'one_off' | 'evergreen' }
// Change an item's type (to fix a mistake made when adding it).
export async function PATCH(req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const type = body.type
  if (type !== 'one_off' && type !== 'evergreen') {
    return NextResponse.json({ error: 'Invalid type.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('items')
    .update({ type })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

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
