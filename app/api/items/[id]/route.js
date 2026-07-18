import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/items/:id  body may include:
//   name:        string                    (rename the item)
//   type:        'one_off' | 'evergreen'   (fix a mistake made when adding)
//   bucket_id:   integer | null            (move to a bucket, or Uncategorized)
//   description: string | null             (long-form detail; empty clears it)
export async function PATCH(req, { params }) {
  const supabase = getSupabase()
  const { id } = await params

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const updates = {}

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }
    updates.name = name
  }

  if ('type' in body) {
    if (body.type !== 'one_off' && body.type !== 'evergreen') {
      return NextResponse.json({ error: 'Invalid type.' }, { status: 400 })
    }
    updates.type = body.type
  }

  if ('bucket_id' in body) {
    if (body.bucket_id !== null && !Number.isInteger(body.bucket_id)) {
      return NextResponse.json({ error: 'Invalid bucket.' }, { status: 400 })
    }
    updates.bucket_id = body.bucket_id
  }

  if ('description' in body) {
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    updates.description = description || null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { error } = await supabase.from('items').update(updates).eq('id', id)

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
