import { EJSON } from 'bson'
import type { Document } from 'mongodb'
import { getClient, poolSize } from '@/lib/mongo-pool'
import { parseRelaxed } from '@/lib/mongo-shell'
import { fail, ok, route } from '@/lib/server/api'
import { requireAuth } from '@/lib/server/auth'
import { assertWritable, logAudit, resolveConnection } from '@/lib/server/connections'
import {
  analyzeSchema,
  collectionStats,
  copyDocuments,
  databaseStats,
  listCollections,
  listDatabases,
} from '@/lib/server/operations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Accepts either relaxed-JSON text or an Extended JSON object and returns BSON. */
function asBson(input: unknown, fallback: Document = {}): Document {
  if (input === undefined || input === null) return fallback
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return fallback
    return parseRelaxed<Document>(trimmed, fallback)
  }
  if (typeof input === 'object') return EJSON.deserialize(input as never) as Document
  throw new Error('Expected a JSON document.')
}

function asBsonValue(input: unknown): unknown {
  if (typeof input === 'string') return parseRelaxed(input)
  if (input && typeof input === 'object') return EJSON.deserialize(input as never)
  return input
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    const body = (await request.json()) as Record<string, unknown> & {
      connectionId?: string
      action?: string
    }
    const action = body.action
    if (!action) return fail('An `action` is required.')
    if (!body.connectionId) return fail('A `connectionId` is required.')

    const connection = await resolveConnection(body.connectionId, user.id)
    const client = await getClient(connection.uri)

    const dbName = typeof body.database === 'string' ? body.database : undefined
    const collectionName = typeof body.collection === 'string' ? body.collection : undefined
    const db = dbName ? client.db(dbName) : undefined

    const requireDb = () => {
      if (!db) throw new Error('A `database` is required for this action.')
      return db
    }
    const requireCollection = () => {
      if (!collectionName) throw new Error('A `collection` is required for this action.')
      return requireDb().collection(collectionName)
    }
    const write = () => assertWritable(connection, action)
    const audit = (entry: { action: string; target: string; detail?: string; destructive?: boolean }) =>
      logAudit({
        userId: user.id,
        userName: user.name,
        connectionId: connection.id,
        connectionName: connection.name,
        ...entry,
      })

    switch (action) {
      case 'health': {
        const started = Date.now()
        const ping = await client.db('admin').command({ ping: 1 })
        return ok({
          reachable: ping.ok === 1,
          latencyMs: Date.now() - started,
          pooled: poolSize(),
          readOnly: connection.readOnly,
        })
      }

      case 'listDatabases':
        return ok(await listDatabases(client))

      case 'databaseStats':
        return ok(await databaseStats(requireDb()))

      case 'createDatabase': {
        write()
        const seed = (body.seedCollection as string)?.trim() || 'documents'
        await requireDb().createCollection(seed)
        await audit({ action: 'database.create', target: `${dbName}`, detail: `seeded with ${seed}` })
        return ok({ created: dbName, seedCollection: seed })
      }

      case 'dropDatabase': {
        write()
        await requireDb().dropDatabase()
        await audit({ action: 'database.drop', target: `${dbName}`, destructive: true })
        return ok({ dropped: dbName })
      }

      case 'renameDatabase': {
        write()
        const newName = (body.newName as string)?.trim()
        if (!newName) return fail('A `newName` is required.')
        const source = requireDb()
        const target = client.db(newName)
        const names = (await source.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
        const migrated: { name: string; copied: number }[] = []
        for (const name of names) {
          const result = await copyDocuments({
            source,
            target,
            sourceCollection: name,
            targetCollection: name,
            mode: 'append',
          })
          migrated.push({ name, copied: result.copied })
        }
        await source.dropDatabase()
        await audit({
          action: 'database.rename',
          target: `${dbName} → ${newName}`,
          detail: `${migrated.length} collections migrated`,
          destructive: true,
        })
        return ok({ from: dbName, to: newName, migrated })
      }

      case 'listCollections':
        return ok(await listCollections(requireDb(), body.withStats !== false))

      case 'collectionStats':
        return ok(await collectionStats(requireDb(), collectionName as string))

      case 'createCollection': {
        write()
        const name = ((body.newName as string) ?? collectionName)?.trim()
        if (!name) return fail('A collection name is required.')
        const options: Document = {}
        if (body.capped) {
          options.capped = true
          options.size = Number(body.size ?? 1_048_576)
          if (body.max) options.max = Number(body.max)
        }
        if (body.validator) options.validator = asBson(body.validator)
        await requireDb().createCollection(name, options as never)
        await audit({ action: 'collection.create', target: `${dbName}.${name}` })
        return ok({ created: name })
      }

      case 'dropCollection': {
        write()
        await requireCollection().drop()
        await audit({
          action: 'collection.drop',
          target: `${dbName}.${collectionName}`,
          destructive: true,
        })
        return ok({ dropped: collectionName })
      }

      case 'truncateCollection': {
        write()
        const result = await requireCollection().deleteMany({})
        await audit({
          action: 'collection.truncate',
          target: `${dbName}.${collectionName}`,
          detail: `${result.deletedCount} documents removed`,
          destructive: true,
        })
        return ok({ deletedCount: result.deletedCount })
      }

      case 'renameCollection': {
        write()
        const newName = (body.newName as string)?.trim()
        if (!newName) return fail('A `newName` is required.')
        await requireCollection().rename(newName, { dropTarget: Boolean(body.dropTarget) })
        await audit({
          action: 'collection.rename',
          target: `${dbName}.${collectionName} → ${newName}`,
        })
        return ok({ renamedTo: newName })
      }

      case 'cloneCollection': {
        write()
        const targetCollection = (body.targetCollection as string)?.trim()
        if (!targetCollection) return fail('A `targetCollection` is required.')
        const targetDatabase = ((body.targetDatabase as string) || dbName) as string
        const result = await copyDocuments({
          source: requireDb(),
          target: client.db(targetDatabase),
          sourceCollection: collectionName as string,
          targetCollection,
          mode: (body.mode as 'append' | 'overwrite' | 'upsert') ?? 'append',
          filter: asBson(body.filter),
        })
        await audit({
          action: 'collection.clone',
          target: `${dbName}.${collectionName} → ${targetDatabase}.${targetCollection}`,
          detail: `${result.copied} of ${result.total} documents`,
        })
        return ok(result)
      }

      case 'mergeCollections': {
        write()
        const sources = (body.sources as string[]) ?? []
        const targetCollection = (body.targetCollection as string)?.trim()
        if (sources.length === 0) return fail('At least one source collection is required.')
        if (!targetCollection) return fail('A `targetCollection` is required.')
        const targetDatabase = ((body.targetDatabase as string) || dbName) as string
        const summary: { name: string; copied: number; total: number; skipped: number }[] = []
        for (const [index, source] of sources.entries()) {
          const result = await copyDocuments({
            source: requireDb(),
            target: client.db(targetDatabase),
            sourceCollection: source,
            targetCollection,
            mode: index === 0 ? ((body.mode as never) ?? 'append') : 'append',
          })
          summary.push({ name: source, ...result })
        }
        await audit({
          action: 'collection.merge',
          target: `${targetDatabase}.${targetCollection}`,
          detail: `${sources.length} sources merged`,
        })
        return ok({ summary })
      }

      case 'listDocuments': {
        const col = requireCollection()
        const filter = asBson(body.filter)
        const sort = asBson(body.sort, { _id: -1 })
        const projection = asBson(body.projection)
        const pageSize = Math.min(Math.max(Number(body.pageSize ?? 25), 1), 200)
        const page = Math.max(Number(body.page ?? 1), 1)

        const cursor = col
          .find(filter, Object.keys(projection).length ? { projection } : {})
          .sort(sort as never)
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .maxTimeMS(20_000)

        const [documents, total] = await Promise.all([
          cursor.toArray(),
          Object.keys(filter).length
            ? col.countDocuments(filter, { maxTimeMS: 20_000 })
            : col.estimatedDocumentCount(),
        ])

        return ok({ documents, total, page, pageSize })
      }

      case 'insertDocuments': {
        write()
        const parsed = asBsonValue(body.documents)
        const docs = Array.isArray(parsed) ? (parsed as Document[]) : [parsed as Document]
        if (docs.length === 0) return fail('No documents to insert.')
        const result = await requireCollection().insertMany(docs, { ordered: false })
        await audit({
          action: 'document.insert',
          target: `${dbName}.${collectionName}`,
          detail: `${result.insertedCount} inserted`,
        })
        return ok({ insertedCount: result.insertedCount, insertedIds: result.insertedIds })
      }

      case 'replaceDocument': {
        write()
        const document = asBson(body.document)
        const { _id, ...rest } = document
        const id = body.id !== undefined ? asBsonValue(body.id) : _id
        if (id === undefined) return fail('The document must include an `_id` to be replaced.')
        const result = await requireCollection().replaceOne({ _id: id as never }, rest)
        await audit({
          action: 'document.replace',
          target: `${dbName}.${collectionName}`,
          detail: `matched ${result.matchedCount}, modified ${result.modifiedCount}`,
        })
        return ok(result)
      }

      case 'updateDocuments': {
        write()
        const filter = asBson(body.filter)
        const update = asBson(body.update)
        if (Object.keys(update).length === 0) return fail('An update document is required.')
        const col = requireCollection()
        const result = body.many
          ? await col.updateMany(filter, update as never, { upsert: Boolean(body.upsert) })
          : await col.updateOne(filter, update as never, { upsert: Boolean(body.upsert) })
        await audit({
          action: body.many ? 'document.updateMany' : 'document.updateOne',
          target: `${dbName}.${collectionName}`,
          detail: `matched ${result.matchedCount}, modified ${result.modifiedCount}`,
        })
        return ok(result)
      }

      case 'deleteDocuments': {
        write()
        const col = requireCollection()
        const ids = body.ids as unknown[] | undefined
        if (ids && ids.length > 0) {
          const deserialized = ids.map((id) => asBsonValue(id))
          const result = await col.deleteMany({ _id: { $in: deserialized as never[] } })
          await audit({
            action: 'document.delete',
            target: `${dbName}.${collectionName}`,
            detail: `${result.deletedCount} documents by id`,
            destructive: true,
          })
          return ok(result)
        }
        const filter = asBson(body.filter)
        if (Object.keys(filter).length === 0 && !body.allowEmptyFilter) {
          return fail('Refusing to delete with an empty filter. Use “Truncate collection” instead.')
        }
        const result = body.many === false ? await col.deleteOne(filter) : await col.deleteMany(filter)
        await audit({
          action: 'document.delete',
          target: `${dbName}.${collectionName}`,
          detail: `${result.deletedCount} documents by filter`,
          destructive: true,
        })
        return ok(result)
      }

      case 'listIndexes': {
        const indexes = await requireCollection().indexes()
        const usage = await requireCollection()
          .aggregate([{ $indexStats: {} }])
          .toArray()
          .catch(() => [] as Document[])
        const usageByName = new Map(usage.map((row) => [row.name as string, row]))
        return ok(
          indexes.map((index) => ({
            ...index,
            accesses: (usageByName.get(index.name as string)?.accesses as Document | undefined) ?? null,
          })),
        )
      }

      case 'createIndex': {
        write()
        const keys = asBson(body.keys)
        if (Object.keys(keys).length === 0) return fail('Index keys are required.')
        const options = asBson(body.options)
        const name = await requireCollection().createIndex(keys as never, options as never)
        await audit({
          action: 'index.create',
          target: `${dbName}.${collectionName}`,
          detail: name,
        })
        return ok({ name })
      }

      case 'dropIndex': {
        write()
        const name = (body.name as string)?.trim()
        if (!name) return fail('An index `name` is required.')
        await requireCollection().dropIndex(name)
        await audit({
          action: 'index.drop',
          target: `${dbName}.${collectionName}`,
          detail: name,
          destructive: true,
        })
        return ok({ dropped: name })
      }

      case 'analyzeSchema':
        return ok(
          await analyzeSchema(requireDb(), collectionName as string, Number(body.sampleSize ?? 400)),
        )

      case 'distinctValues': {
        const field = (body.field as string)?.trim()
        if (!field) return fail('A `field` is required.')
        const values = await requireCollection().distinct(field, asBson(body.filter))
        return ok(values.slice(0, 200))
      }

      default:
        return fail(`Unknown action \`${action}\`.`, 400)
    }
  })
}
