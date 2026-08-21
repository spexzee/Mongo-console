import { ensureAppIndexes, usersCol } from '@/lib/app-db'
import {
  createSessionCookieHeader,
  hashPassword,
  signSession,
  toUserSummary,
} from '@/lib/server/auth'
import { fail, ok, route } from '@/lib/server/api'
import type { UserDoc } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return route(async () => {
    const body = (await request.json()) as {
      name?: string
      email?: string
      password?: string
    }

    const name = body.name?.trim()
    const email = body.email?.trim().toLowerCase()
    const password = body.password

    if (!name) return fail('Name is required.')
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('A valid email address is required.')
    }
    if (!password || password.length < 6) {
      return fail('Password must be at least 6 characters long.')
    }

    await ensureAppIndexes()
    const col = await usersCol()

    const existing = await col.findOne({ email })
    if (existing) {
      return fail('An account with this email already exists. Please log in.', 409)
    }

    const { hash, salt } = hashPassword(password)
    const now = new Date()

    const userDoc: UserDoc = {
      name,
      email,
      passwordHash: hash,
      salt,
      createdAt: now,
      lastLoginAt: now,
    }

    const result = await col.insertOne(userDoc)
    const userSummary = toUserSummary({ ...userDoc, _id: result.insertedId })

    const token = signSession({
      id: userSummary.id,
      email: userSummary.email,
      name: userSummary.name,
    })

    const response = ok({ user: userSummary }, { status: 201 })
    response.headers.set('Set-Cookie', createSessionCookieHeader(token))
    return response
  })
}
