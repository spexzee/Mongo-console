import { ensureAppIndexes, usersCol } from '@/lib/app-db'
import {
  createSessionCookieHeader,
  signSession,
  toUserSummary,
  verifyPassword,
} from '@/lib/server/auth'
import { fail, ok, route } from '@/lib/server/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return route(async () => {
    const body = (await request.json()) as {
      email?: string
      password?: string
    }

    const email = body.email?.trim().toLowerCase()
    const password = body.password

    if (!email || !password) {
      return fail('Email and password are required.')
    }

    await ensureAppIndexes()
    const col = await usersCol()

    const user = await col.findOne({ email })
    if (!user) {
      return fail('Invalid email or password.', 401)
    }

    const isValid = verifyPassword(password, user.passwordHash, user.salt)
    if (!isValid) {
      return fail('Invalid email or password.', 401)
    }

    await col.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {})

    const userSummary = toUserSummary(user)
    const token = signSession({
      id: userSummary.id,
      email: userSummary.email,
      name: userSummary.name,
    })

    const response = ok({ user: userSummary })
    response.headers.set('Set-Cookie', createSessionCookieHeader(token))
    return response
  })
}
