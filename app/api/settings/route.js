import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const START_KEY = 'start_time'

// GET /api/settings -> { start_time } ("HH:MM" or null)
export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('app_meta')
    .select('value')
    .eq('key', START_KEY)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ start_time: data?.value || null })
}

// POST /api/settings  body: { start_time: "HH:MM" | null }
export async function POST(req) {
  const supabase = getSupabase()

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const value = body.start_time
  if (value !== null && !/^\d{2}:\d{2}$/.test(value)) {
    return NextResponse.json({ error: 'Invalid start_time.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_meta')
    .upsert({ key: START_KEY, value })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
