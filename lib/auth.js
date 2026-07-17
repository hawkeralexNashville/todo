// Site-wide password gate helpers.
//
// There are no user accounts. A single shared password (SITE_PASSWORD)
// unlocks the whole site. When the correct password is submitted we store a
// signed token in an HttpOnly cookie. The token is an HMAC of a fixed message
// keyed by the password, so it cannot be forged without knowing the password,
// and it never contains the password itself.
//
// These helpers use the Web Crypto API (globalThis.crypto.subtle) so the same
// code runs in both the Edge middleware and Node route handlers.

export const COOKIE_NAME = 'todo_auth'
const AUTH_MESSAGE = 'todo-auth-v1'

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function computeToken(password) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(AUTH_MESSAGE))
  return toHex(sig)
}

export async function verifyToken(token) {
  const password = process.env.SITE_PASSWORD
  if (!password || !token) return false
  const expected = await computeToken(password)
  // Constant-length compare. Both are fixed-length hex strings.
  if (token.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}
