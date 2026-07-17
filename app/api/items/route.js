import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { runDailyReset, logicalDay } from '@/lib/reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/items -> active items, plus items completed today, in priority
// order (runs the daily reset first).
//
// Including today's completions (evergreen done_today, or a one-off finished
// today) lets Organize show a finished item in place, marked done, instead of
// it vanishing — useful when reviewing/prepping at the end of the day. A
// one-off completed on an earlier day is excluded (it never reappears, per
// the one-off rule); an evergreen from an earlier day is excluded too (the
// daily reset already flips it back to active before this query runs).
//
// Each item is annotated with:
//   done    - true if it's a today's-completion row rather than a live active one
//   skipped - true if it was skipped during the current logical day
export async function GET() {
  const supabase = getSupabase()
  await runDailyReset(supabase)

  const today = logicalDay()
  // Coarse bound so we don't scan the full soft-delete history; the exact
  // "is this today" check happens below via logicalDay().
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('items')
    .select('id, name, type, status, position, prioritized, bucket_id, completed_at, created_at, skipped_at')
    .or(`status.eq.active,status.eq.done_today,and(status.eq.deleted,completed_at.gte.${cutoff})`)
    .order('position', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = data
    .filter((it) => {
      if (it.status === 'active') return true
      if (it.status === 'done_today') return true // reset already ran above
      return it.completed_at && logicalDay(new Date(it.completed_at)) === today
    })
    .map((it) => ({
      ...it,
      done: it.status !== 'active',
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
