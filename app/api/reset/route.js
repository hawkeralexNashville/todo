import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { runManualReset } from '@/lib/reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/reset -> the Organize screen's manual Reset button. Flips every
// evergreen currently "done today" back to active, and clears "skipped
// today" flags — the same action the automatic 4 AM reset performs, just
// triggered on demand. One-off items are untouched (once done, they're done
// for good). The automatic reset still runs independently as a fallback.
export async function POST() {
  const supabase = getSupabase()
  try {
    await runManualReset(supabase)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
