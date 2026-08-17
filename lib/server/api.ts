import { NextResponse } from 'next/server'
import { isParseError } from '@/lib/mongo-shell'
import { toJsonSafe } from '@/lib/ejson'

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data: toJsonSafe(data) }, init)
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

/** Converts driver / parser errors into a friendly message and status code. */
export function describeError(error: unknown): { message: string; status: number } {
  if (isParseError(error)) return { message: error.message, status: 400 }
  if (error instanceof Error) {
    const message = error.message
    if (/APP_MONGODB_URI|APP_ENCRYPTION_KEY/.test(message)) {
      return { message, status: 500 }
    }
    if (/Authentication failed|bad auth/i.test(message)) {
      return { message: 'Authentication failed. Check the username and password in the URI.', status: 401 }
    }
    if (/ENOTFOUND|EAI_AGAIN|querySrv/i.test(message)) {
      return { message: 'Host could not be resolved. Check the hostname in the URI.', status: 502 }
    }
    if (/ECONNREFUSED/i.test(message)) {
      return { message: 'Connection refused. Is MongoDB reachable from this server?', status: 502 }
    }
    if (/Server selection timed out|timed out/i.test(message)) {
      return {
        message:
          'Server selection timed out. The host may be unreachable or your IP may not be allow-listed.',
        status: 504,
      }
    }
    if (/not authorized|Unauthorized|requires authentication/i.test(message)) {
      return { message: `Not authorized: ${message}`, status: 403 }
    }
    if (/SSL alert|tlsv1 alert|certificate|tls/i.test(message)) {
      return {
        message:
          'SSL/TLS handshake error. Ensure your connection string includes `retryWrites=true&w=majority` and that your current IP address is whitelisted in MongoDB Atlas Network Access (0.0.0.0/0).',
        status: 502,
      }
    }
    return { message, status: 400 }
  }
  return { message: String(error), status: 500 }
}

/** Wraps a route handler so thrown errors always return structured JSON. */
export async function route(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler()
  } catch (error) {
    const { message, status } = describeError(error)
    console.log('[v0] route error:', message)
    return fail(message, status)
  }
}
