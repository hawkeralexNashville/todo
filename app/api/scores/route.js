import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GAMES = ['breakout', 'invaders']

// GET /api/scores?game=breakout -> { scores: [{score, created_at}], plays }
export async function GET(req) {
  const supabase = getSupabase()
  const game = new URL(req.url).searchParams.get('game')
  if (!GAMES.includes(game)) {
    return NextResponse.json({ error: 'Unknown game.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scores')
    .select('score, created_at')
    .eq('game', game)
    .order('score', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { count } = await supabase
    .from('scores')
    .select('id', { count: 'exact', head: true })
    .eq('game', game)

  return NextResponse.json({ scores: data, plays: count || 0 })
}

// POST /api/scores  body: { game, score }
export async function POST(req) {
  const supabase = getSupabase()

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { game, score } = body
  if (!GAMES.includes(game)) {
    return NextResponse.json({ error: 'Unknown game.' }, { status: 400 })
  }
  if (!Number.isInteger(score) || score < 0) {
    return NextResponse.json({ error: 'Invalid score.' }, { status: 400 })
  }

  const { error } = await supabase.from('scores').insert({ game, score })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
