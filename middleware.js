import { NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken } from './lib/auth'

// Server-side password gate. Every request that isn't the login page, the login
// API, or a static asset must carry a valid auth cookie. API requests get a 401;
// page requests get redirected to /login.

export async function middleware(req) {
  const { pathname } = req.nextUrl

  const isLogin =
    pathname === '/login' || pathname.startsWith('/api/login')

  if (isLogin) return NextResponse.next()

  const token = req.cookies.get(COOKIE_NAME)?.value
  const ok = await verifyToken(token)

  if (ok) return NextResponse.next()

  if (pathname.startsWith('/api')) {
    return new NextResponse(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  if (pathname && pathname !== '/') {
    url.searchParams.set('next', pathname)
  }
  return NextResponse.redirect(url)
}

export const config = {
  // Run on everything except Next internals and common static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
}
