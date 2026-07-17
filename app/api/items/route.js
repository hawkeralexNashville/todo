import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { runDailyReset } from '@/lib/reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/items -> active items in order (runs the daily reset first).
export async function GET() {
  const supabase = getSupabase()
  await runDailyReset(supabase)

  const { data, error } = await supabase
    .from('items')
    .select('id, name, type, status, position, completed_at, created_at')
    .eq('status', 'active')
    .order('position', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data })
}

// POST /api/items -> create a new item at the bottom of the active list.
export async function POST(req) {
  const supabase = getSupabase()

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const type = body.type

  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }
  if (type !== 'one_off' && type !== 'evergreen') {
    return NextResponse.json({ error: 'Invalid type.' }, { status: 400 })
  }

  // Append to the bottom: one past the current max active position.
  const { data: last } = await supabase
    .from('items')
    .select('position')
    .eq('status', 'active')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = last ? last.position + 1 : 0

  const { data, error } = await supabase
    .from('items')
    .insert({ name, type, status: 'active', position })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data }, { status: 201 })
}
