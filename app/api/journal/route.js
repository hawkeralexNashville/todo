import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { logicalDay } from '@/lib/reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/journal          -> today's entry + { today, content, days: [...] }
// GET /api/journal?day=YYYY-MM-DD -> that day's entry { day, content }
export async function GET(req) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const today = logicalDay()
  const day = url.searchParams.get('day') || today

  if (!DAY_RE.test(day)) {
    return NextResponse.json({ error: 'Invalid day.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('journal')
    .select('content')
    .eq('day', day)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // List of days that have (non-empty) entries, most recent first.
  const { data: list } = await supabase
    .from('journal')
    .select('day')
    .neq('content', '')
    .order('day', { ascending: false })
    .limit(365)

  return NextResponse.json({
    today,
    day,
    content: data?.content || '',
    days: (list || []).map((r) => r.day),
  })
}

// POST /api/journal  body: { day, content } -> upsert
export async function POST(req) {
  const supabase = getSupabase()

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const day = body.day
  const content = typeof body.content === 'string' ? body.content : ''
  if (!DAY_RE.test(day || '')) {
    return NextResponse.json({ error: 'Invalid day.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('journal')
    .upsert({ day, content, updated_at: new Date().toISOString() })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
