import { withTempClient } from '@/lib/mongo-pool'
import { describeError, fail, ok, route } from '@/lib/server/api'
import { resolveConnection } from '@/lib/server/connections'
import { uriHost } from '@/lib/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Tests a URI (or an existing profile) and reports server details plus latency. */
export async function POST(request: Request) {
  return route(async () => {
    const body = (await request.json()) as { uri?: string; connectionId?: string }

    let uri = body.uri?.trim()
    if (!uri && body.connectionId) {
      uri = (await resolveConnection(body.connectionId)).uri
    }
    if (!uri) return fail('Provide a connection URI or an existing profile id.')
    if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
      return fail('The URI must start with `mongodb://` or `mongodb+srv://`.')
    }

    const started = Date.now()
    try {
      const result = await withTempClient(uri, async (client) => {
        const admin = client.db('admin').admin()
        const ping = await admin.command({ ping: 1 })
        let version: string | undefined
        let topology: string | undefined
        let databases: number | undefined
        try {
          const info = await admin.command({ buildInfo: 1 })
          version = info.version
        } catch {
          version = undefined
        }
        try {
          const status = await admin.command({ hello: 1 })
          topology = status.setName ? `replica set ${status.setName}` : status.msg ?? 'standalone'
        } catch {
          topology = undefined
        }
        try {
          const list = await admin.listDatabases({ nameOnly: true })
          databases = list.databases.length
        } catch {
          databases = undefined
        }
        return { ping: ping.ok === 1, version, topology, databases }
      })

      return ok({
        reachable: true,
        latencyMs: Date.now() - started,
        host: uriHost(uri),
        ...result,
      })
    } catch (error) {
      const { message } = describeError(error)
      return ok({
        reachable: false,
        latencyMs: Date.now() - started,
        host: uriHost(uri),
        error: message,
      })
    }
  })
}
