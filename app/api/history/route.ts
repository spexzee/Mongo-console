import { ensureAppIndexes, historyCol } from '@/lib/app-db'
import { ok, route } from '@/lib/server/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return route(async () => {
    await ensureAppIndexes()
    const url = new URL(request.url)
    const connectionId = url.searchParams.get('connectionId')
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)
    const col = await historyCol()
    const docs = await col
      .find(connectionId ? { connectionId } : {})
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
    const connectionId = new URL(request.url).searchParams.get('connectionId')
    const col = await historyCol()
    const result = await col.deleteMany(connectionId ? { connectionId } : {})
    return ok({ deletedCount: result.deletedCount })
  })
}
