import type { Db, Document, MongoClient } from 'mongodb'
import { bsonTypeOf } from '@/lib/ejson'
import type { CollectionInfo, DatabaseInfo, SchemaField } from '@/lib/types'

const SYSTEM_DBS = new Set(['admin', 'local', 'config'])

export function isSystemDatabase(name: string) {
  return SYSTEM_DBS.has(name)
}

export async function listDatabases(client: MongoClient): Promise<DatabaseInfo[]> {
  const result = await client.db('admin').admin().listDatabases({ nameOnly: false })
  return result.databases
    .map((entry: { name: string; sizeOnDisk?: number; empty?: boolean }) => ({
      name: entry.name,
      sizeOnDisk: Number(entry.sizeOnDisk ?? 0),
      empty: Boolean(entry.empty),
    }))
    .sort((a: DatabaseInfo, b: DatabaseInfo) => {
      const aSystem = isSystemDatabase(a.name)
      const bSystem = isSystemDatabase(b.name)
      if (aSystem !== bSystem) return aSystem ? 1 : -1
      return a.name.localeCompare(b.name)
    })
}

export async function databaseStats(db: Db) {
  const stats = (await db.command({ dbStats: 1, scale: 1 })) as Document
  return {
    name: db.databaseName,
    collections: Number(stats.collections ?? 0),
    views: Number(stats.views ?? 0),
    objects: Number(stats.objects ?? 0),
    avgObjSize: Number(stats.avgObjSize ?? 0),
    dataSize: Number(stats.dataSize ?? 0),
    storageSize: Number(stats.storageSize ?? 0),
    indexes: Number(stats.indexes ?? 0),
    indexSize: Number(stats.indexSize ?? 0),
    totalSize: Number(stats.totalSize ?? stats.storageSize ?? 0),
  }
}

type StorageStats = {
  count: number
  sizeBytes: number
  storageSizeBytes: number
  avgObjSize: number
  indexCount: number
  indexSizeBytes: number
}

async function statsFor(db: Db, name: string): Promise<StorageStats> {
  try {
    const [row] = await db
      .collection(name)
      .aggregate([{ $collStats: { storageStats: {} } }], { allowDiskUse: false })
      .toArray()
    const storage = (row?.storageStats ?? {}) as Document
    return {
      count: Number(storage.count ?? 0),
      sizeBytes: Number(storage.size ?? 0),
      storageSizeBytes: Number(storage.storageSize ?? 0),
      avgObjSize: Number(storage.avgObjSize ?? 0),
      indexCount: Object.keys((storage.indexSizes ?? {}) as object).length,
      indexSizeBytes: Number(storage.totalIndexSize ?? 0),
    }
  } catch {
    const count = await db.collection(name).estimatedDocumentCount().catch(() => 0)
    return {
      count,
      sizeBytes: 0,
      storageSizeBytes: 0,
      avgObjSize: 0,
      indexCount: 0,
      indexSizeBytes: 0,
    }
  }
}

export async function listCollections(db: Db, withStats = true): Promise<CollectionInfo[]> {
  const raw = await db.listCollections({}, { nameOnly: false }).toArray()
  const base = raw.map((entry: Document) => ({
    name: entry.name as string,
    type: (entry.type as string) ?? 'collection',
    capped: Boolean((entry.options as Document | undefined)?.capped),
  }))

  if (!withStats) {
    return base
      .map((entry: { name: string; type: string; capped: boolean }) => ({
        ...entry,
        count: 0,
        sizeBytes: 0,
        storageSizeBytes: 0,
        avgObjSize: 0,
        indexCount: 0,
        indexSizeBytes: 0,
      }))
      .sort((a: CollectionInfo, b: CollectionInfo) => a.name.localeCompare(b.name))
  }

  const enriched = await Promise.all(
    base.map(async (entry: { name: string; type: string; capped: boolean }) => {
      if (entry.type === 'view') {
        return {
          ...entry,
          count: 0,
          sizeBytes: 0,
          storageSizeBytes: 0,
          avgObjSize: 0,
          indexCount: 0,
          indexSizeBytes: 0,
        }
      }
      return { ...entry, ...(await statsFor(db, entry.name)) }
    }),
  )
  return enriched.sort((a: CollectionInfo, b: CollectionInfo) => a.name.localeCompare(b.name))
}

export async function collectionStats(db: Db, name: string): Promise<CollectionInfo> {
  const info = await db.listCollections({ name }, { nameOnly: false }).next()
  const stats = await statsFor(db, name)
  return {
    name,
    type: info?.type ?? 'collection',
    capped: Boolean((info?.options as Document | undefined)?.capped),
    ...stats,
  }
}

/**
 * Copies documents from one collection to another in batches, reporting progress.
 * Used by clone, merge, and cross-connection transfer.
 */
export async function copyDocuments(options: {
  source: Db
  target: Db
  sourceCollection: string
  targetCollection: string
  mode: 'append' | 'overwrite' | 'upsert'
  batchSize?: number
  filter?: Document
  onProgress?: (copied: number, total: number) => void | Promise<void>
}): Promise<{ copied: number; total: number; skipped: number }> {
  const {
    source,
    target,
    sourceCollection,
    targetCollection,
    mode,
    batchSize = 500,
    filter = {},
    onProgress,
  } = options

  const from = source.collection(sourceCollection)
  const to = target.collection(targetCollection)

  const total = await from.countDocuments(filter)

  if (mode === 'overwrite') {
    await to.deleteMany({})
  }

  let copied = 0
  let skipped = 0
  let batch: Document[] = []

  const flush = async () => {
    if (batch.length === 0) return
    if (mode === 'upsert') {
      const operations = batch.map((doc) => {
        const { _id, ...rest } = doc
        return _id === undefined
          ? { insertOne: { document: doc } }
          : { replaceOne: { filter: { _id }, replacement: rest, upsert: true } }
      })
      const result = await to.bulkWrite(operations as never, { ordered: false })
      copied += result.upsertedCount + result.modifiedCount + result.insertedCount
    } else {
      try {
        const result = await to.insertMany(batch, { ordered: false })
        copied += result.insertedCount
      } catch (error) {
        const writeErrors = (error as { writeErrors?: unknown[] }).writeErrors
        const inserted = (error as { result?: { insertedCount?: number } }).result?.insertedCount ?? 0
        copied += inserted
        skipped += writeErrors?.length ?? batch.length - inserted
        if (!writeErrors) throw error
      }
    }
    batch = []
    await onProgress?.(copied, total)
  }

  const cursor = from.find(filter, { batchSize })
  for await (const doc of cursor) {
    batch.push(doc)
    if (batch.length >= batchSize) await flush()
  }
  await flush()
  await onProgress?.(copied, total)

  return { copied, total, skipped }
}

/** Samples documents and derives a field-level schema report. */
export async function analyzeSchema(
  db: Db,
  collection: string,
  sampleSize = 400,
): Promise<{ sampled: number; fields: SchemaField[] }> {
  const docs = await db
    .collection(collection)
    .aggregate([{ $sample: { size: Math.min(Math.max(sampleSize, 1), 5000) } }])
    .toArray()

  const sampled = docs.length
  const map = new Map<string, { types: Map<string, number>; present: number; samples: string[] }>()

  const visit = (value: unknown, prefix: string) => {
    const entry = map.get(prefix) ?? { types: new Map<string, number>(), present: 0, samples: [] as string[] }
    const type = bsonTypeOf(normalizeForType(value))
    entry.types.set(type, (entry.types.get(type) ?? 0) + 1)
    entry.present += 1
    if (entry.samples.length < 3) {
      entry.samples.push(previewValue(value))
    }
    map.set(prefix, entry)

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>
      const keys = Object.keys(record)
      const isWrapper = keys.length === 1 && keys[0].startsWith('$')
      if (!isWrapper && !isBsonInstance(value)) {
        for (const key of keys) visit(record[key], prefix ? `${prefix}.${key}` : key)
      }
    }
  }

  for (const doc of docs) {
    for (const key of Object.keys(doc)) visit((doc as Document)[key], key)
  }

  const fields: SchemaField[] = [...map.entries()]
    .map(([path, entry]) => ({
      path,
      types: [...entry.types.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      presentIn: entry.present,
      missingIn: Math.max(sampled - entry.present, 0),
      coverage: sampled === 0 ? 0 : entry.present / sampled,
      samples: entry.samples,
    }))
    .sort((a, b) => b.coverage - a.coverage || a.path.localeCompare(b.path))

  return { sampled, fields }
}

function isBsonInstance(value: unknown) {
  const name = (value as { _bsontype?: string })?._bsontype
  return typeof name === 'string'
}

function normalizeForType(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() }
  const bsontype = (value as { _bsontype?: string })?._bsontype
  if (bsontype === 'ObjectId') return { $oid: String(value) }
  if (bsontype === 'Long') return { $numberLong: String(value) }
  if (bsontype === 'Decimal128') return { $numberDecimal: String(value) }
  if (bsontype === 'Binary') return { $binary: {} }
  if (bsontype === 'BSONRegExp') return { $regularExpression: {} }
  if (bsontype === 'Timestamp') return { $timestamp: {} }
  if (bsontype === 'MinKey') return { $minKey: 1 }
  if (bsontype === 'MaxKey') return { $maxKey: 1 }
  return value
}

function previewValue(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Date) return value.toISOString()
  if (isBsonInstance(value)) return String(value)
  if (typeof value === 'object') {
    const text = JSON.stringify(value)
    return text.length > 60 ? `${text.slice(0, 57)}…` : text
  }
  const text = String(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}
