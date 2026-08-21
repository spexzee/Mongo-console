import { ensureAppIndexes, historyCol } from '@/lib/app-db'
import { ok, route } from '@/lib/server/api'
import { requireAuth } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    await ensureAppIndexes()
    const url = new URL(request.url)
    const connectionId = url.searchParams.get('connectionId')
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)
    const col = await historyCol()

    const query: Record<string, unknown> = {
      $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
    }
    if (connectionId) {
      query.connectionId = connectionId
    }

    const docs = await col
      .find(query as any)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    return ok(
      docs.map((doc) => ({
        id: String(doc._id),
        connectionId: doc.connectionId,
        connectionName: doc.connectionName,
        database: doc.database,
        collection: doc.collection,
        command: doc.command,
        operation: doc.operation,
        durationMs: doc.durationMs,
        ok: doc.ok,
        error: doc.error,
        resultCount: doc.resultCount,
        createdAt: doc.createdAt.toISOString(),
      })),
    )
  })
}

export async function DELETE(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    const connectionId = new URL(request.url).searchParams.get('connectionId')
    const col = await historyCol()

    const query: Record<string, unknown> = {
      $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
    }
    if (connectionId) {
      query.connectionId = connectionId
    }

    const result = await col.deleteMany(query as any)
    return ok({ deletedCount: result.deletedCount })
  })
}
