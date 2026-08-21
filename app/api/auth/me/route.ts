import { usersCol } from '@/lib/app-db'
import { getAuthUser, toUserSummary } from '@/lib/server/auth'
import { fail, ok, route } from '@/lib/server/api'
import { objectId } from '@/lib/server/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return route(async () => {
    const auth = await getAuthUser(request)
    if (!auth) {
      return fail('Not authenticated', 401)
    }

    const col = await usersCol()
    const user = await col.findOne({ _id: objectId(auth.id) })
    if (!user) {
      return fail('User account not found', 404)
    }

    return ok({ user: toUserSummary(user) })
  })
}
