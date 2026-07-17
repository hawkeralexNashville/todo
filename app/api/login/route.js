import { NextResponse } from 'next/server'
import { COOKIE_NAME, computeToken } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
  const password = process.env.SITE_PASSWORD
  if (!password) {
    return NextResponse.json(
      { error: 'Server is missing SITE_PASSWORD.' },
      { status: 500 },
    )
  }

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  if (!body || body.password !== password) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 })
  }

  const token = await computeToken(password)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
  return res
}
