import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/buckets/:id  body: { name } -> rename a bucket.
export async function PATCH(req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('buckets')
    .update({ name })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/buckets/:id -> delete a bucket. Its items become Uncategorized
// (bucket_id is set to null by the foreign key's ON DELETE SET NULL).
export async function DELETE(_req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  const { error } = await supabase.from('buckets').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
