import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/items/done -> completed items for the Done screen:
//   - one_off items marked done (status 'deleted')
//   - evergreen items currently 'done_today'
// Most recently completed first.
export async function GET() {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('items')
    .select('id, name, type, status, bucket_id, completed_at')
    .in('status', ['deleted', 'done_today'])
    .order('completed_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data })
}
