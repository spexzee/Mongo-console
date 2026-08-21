import { ensureAppIndexes, savedQueriesCol } from '@/lib/app-db'
import { fail, ok, route } from '@/lib/server/api'
import { requireAuth } from '@/lib/server/auth'
import { objectId } from '@/lib/server/connections'
import type { SavedQueryDoc } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toSummary(doc: SavedQueryDoc) {
  return {
    id: String(doc._id),
    name: doc.name,
    description: doc.description,
    connectionId: doc.connectionId,
    database: doc.database,
    collection: doc.collection,
    command: doc.command,
    createdAt: doc.createdAt.toISOString(),
  }
}

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    await ensureAppIndexes()
    const col = await savedQueriesCol()
    const docs = await col
      .find({
        $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
      } as any)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray()
    return ok(docs.map(toSummary))
  })
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    await ensureAppIndexes()
    const body = (await request.json()) as Partial<{
      name: string
      description: string
      connectionId: string
      database: string
      collection: string
      command: string
    }>

    const name = body.name?.trim()
    const command = body.command?.trim()
    if (!name) return fail('Give the query a name.')
    if (!command) return fail('The query cannot be empty.')

    const col = await savedQueriesCol()
    const existing = await col.findOne({
      name,
      $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
    } as any)
    if (existing) {
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            userId: user.id,
            description: body.description?.trim(),
            connectionId: body.connectionId,
            database: body.database,
            collection: body.collection,
            command,
          },
        },
      )
      const updated = await col.findOne({ _id: existing._id })
      return ok(toSummary(updated as SavedQueryDoc))
    }

    const doc: SavedQueryDoc = {
      userId: user.id,
      name,
      description: body.description?.trim(),
      connectionId: body.connectionId,
      database: body.database,
      collection: body.collection,
      command,
      createdAt: new Date(),
    }
    const result = await col.insertOne(doc)
    return ok(toSummary({ ...doc, _id: result.insertedId }))
  })
}

export async function DELETE(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return fail('An `id` is required.')
    const col = await savedQueriesCol()
    await col.deleteOne({
      _id: objectId(id),
      $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
    } as any)
    return ok({ deleted: id })
  })
}
