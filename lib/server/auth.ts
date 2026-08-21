import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { cookies } from 'next/headers'
import type { AuthUser, UserDoc, UserSummary } from '@/lib/types'

export const AUTH_COOKIE_NAME = 'mongo_console_session'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 days

function getSecret(): string {
  const secret = process.env.APP_ENCRYPTION_KEY || 'default-secret-key-change-in-production'
  return secret
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

/** Hashes a plain password with a secure random salt using scrypt. */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = scryptSync(password, salt, 64)
  return {
    hash: derivedKey.toString('hex'),
    salt,
  }
}

/** Verifies a password against a stored scrypt hash and salt. */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const derivedKey = scryptSync(password, salt, 64)
    const storedBuffer = Buffer.from(storedHash, 'hex')
    if (derivedKey.length !== storedBuffer.length) return false
    return timingSafeEqual(derivedKey, storedBuffer)
  } catch {
    return false
  }
}

/** Creates a signed JWT session token for an authenticated user. */
export function signSession(user: AuthUser): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const message = `${encodedHeader}.${encodedPayload}`

  const signature = createHmac('sha256', getSecret())
    .update(message)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${message}.${signature}`
}

/** Verifies a JWT session token and returns the user if valid. */
export function verifySession(token: string): AuthUser | null {
  try {
    if (!token || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [encodedHeader, encodedPayload, signature] = parts
    const message = `${encodedHeader}.${encodedPayload}`

    const expectedSignature = createHmac('sha256', getSecret())
      .update(message)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    const sigBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expectedSignature)
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null
    }

    const payloadJson = base64UrlDecode(encodedPayload)
    const payload = JSON.parse(payloadJson) as {
      sub: string
      email: string
      name: string
      exp: number
    }

    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < now) {
      return null
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    }
  } catch {
    return null
  }
}

export function toUserSummary(doc: UserDoc): UserSummary {
  return {
    id: String(doc._id),
    email: doc.email,
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const list: Record<string, string> = {}
  if (!header) return list
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=')
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim())
    }
  })
  return list
}

/** Retrieves the current authenticated user from request headers or Next.js cookies. */
export async function getAuthUser(request?: Request): Promise<AuthUser | null> {
  let token: string | undefined

  if (request) {
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      const parsed = parseCookies(cookieHeader)
      token = parsed[AUTH_COOKIE_NAME]
    }
    if (!token) {
      const authHeader = request.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim()
      }
    }
  }

  if (!token) {
    try {
      const cookieStore = await cookies()
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value
    } catch {
      // Cookies not accessible outside of request scope
    }
  }

  if (!token) return null
  return verifySession(token)
}

export class AuthError extends Error {
  status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'AuthError'
  }
}

/** Ensures user is authenticated or throws AuthError. */
export async function requireAuth(request?: Request): Promise<AuthUser> {
  const user = await getAuthUser(request)
  if (!user) {
    throw new AuthError('Please sign in to continue.')
  }
  return user
}

/** Formats session cookie header string */
export function createSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === 'production'
  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${
    isProd ? '; Secure' : ''
  }`
}

/** Formats session deletion cookie header string */
export function createClearSessionCookieHeader(): string {
  const isProd = process.env.NODE_ENV === 'production'
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`
}
