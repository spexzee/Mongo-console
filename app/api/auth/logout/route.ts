import { createClearSessionCookieHeader } from '@/lib/server/auth'
import { ok, route } from '@/lib/server/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return route(async () => {
    const response = ok({ message: 'Signed out successfully' })
    response.headers.set('Set-Cookie', createClearSessionCookieHeader())
    return response
  })
}
