import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { runDailyReset, logicalDay } from '@/lib/reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/items -> active items in priority order (runs the daily reset first).
// Each item is annotated with `skipped`: true if it was skipped during the
// current logical day. The list stays in position order; the Home screen uses
// `skipped` to move skipped items to the back of today's queue.
export async function GET() {
  const supabase = getSupabase()
  await runDailyReset(supabase)

  const { data, error } = await supabase
    .from('items')
    .select('id, name, type, status, position, prioritized, bucket_id, completed_at, created_at, skipped_at')
    .eq('status', 'active')
    .order('position', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const today = logicalDay()
  const items = data.map((it) => ({
    ...it,
    skipped: it.skipped_at
      ? logicalDay(new Date(it.skipped_at)) === today
      : false,
  }))

  return NextResponse.json({ items })
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

  let bucketId = null
  if ('bucket_id' in body && body.bucket_id !== null) {
    if (!Number.isInteger(body.bucket_id)) {
      return NextResponse.json({ error: 'Invalid bucket.' }, { status: 400 })
    }
    bucketId = body.bucket_id
  }

  // New items start in the backlog (prioritized = false). They only join the
  // queue once dragged into the Priority list on the Organize screen.
  const { data, error } = await supabase
    .from('items')
    .insert({
      name,
      type,
      status: 'active',
      prioritized: false,
      bucket_id: bucketId,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data }, { status: 201 })
}
