import { EJSON } from 'bson'
import type { Document } from 'mongodb'
import { backupsCol } from '@/lib/app-db'
import { getClient } from '@/lib/mongo-pool'
import { assertWritable, logAudit, resolveConnection } from '@/lib/server/connections'
import type { BackupDoc } from '@/lib/types'

/** Documents are stored as one Extended JSON bundle keyed by collection name. */
export type BackupPayload = {
  format: 'mongo-console-backup'
  version: 1
  database: string
  collections: Record<string, unknown[]>
}

export type BackupSummary = {
  id: string
  label: string
  connectionId: string
  connectionName: string
  database: string
  collections: { name: string; count: number }[]
  sizeBytes: number
  documentCount: number
  createdAt: string
  scheduled: boolean
}

export function toBackupSummary(doc: BackupDoc): BackupSummary {
  return {
    id: String(doc._id),
    label: doc.label,
    connectionId: doc.connectionId,
    connectionName: doc.connectionName,
    database: doc.database,
    collections: doc.collections,
    sizeBytes: doc.sizeBytes,
    documentCount: doc.documentCount,
    createdAt: doc.createdAt.toISOString(),
    scheduled: doc.scheduled,
  }
}

/** Reads a database into the app store as a restorable snapshot. */
export async function createBackup(options: {
  connectionId: string
  database: string
  collections?: string[]
  label?: string
  scheduled?: boolean
}): Promise<BackupSummary> {
  const connection = await resolveConnection(options.connectionId)
  const client = await getClient(connection.uri)
  const db = client.db(options.database)

  const available = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'))

  const names =
    options.collections && options.collections.length > 0
      ? available.filter((name) => options.collections?.includes(name))
      : available

  if (names.length === 0) throw new Error('There are no collections to back up.')

  const bundle: Record<string, unknown[]> = {}
  const manifest: { name: string; count: number }[] = []
  let documentCount = 0

  for (const name of names) {
    const docs = await db.collection(name).find({}).maxTimeMS(120_000).toArray()
    bundle[name] = JSON.parse(EJSON.stringify(docs as never)) as unknown[]
    manifest.push({ name, count: docs.length })
    documentCount += docs.length
  }

  const payload: BackupPayload = {
    format: 'mongo-console-backup',
    version: 1,
    database: options.database,
    collections: bundle,
  }
  const serialized = JSON.stringify(payload)

  const col = await backupsCol()
  const doc: BackupDoc = {
    label:
      options.label?.trim() ||
      `${options.database} · ${new Date().toISOString().replace('T', ' ').slice(0, 16)}`,
    connectionId: connection.id,
    connectionName: connection.name,
    database: options.database,
    collections: manifest,
    payload: serialized,
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
    documentCount,
    createdAt: new Date(),
    scheduled: options.scheduled ?? false,
  }

  if (doc.sizeBytes > 14 * 1024 * 1024) {
    throw new Error(
      `This snapshot is ${(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB, which exceeds the 14 MB document limit for stored backups. Back up individual collections, or use Export to download the data instead.`,
    )
  }

  const result = await col.insertOne(doc)
  await logAudit({
    connectionId: connection.id,
    connectionName: connection.name,
    action: options.scheduled ? 'backup.scheduled' : 'backup.create',
    target: options.database,
    detail: `${manifest.length} collections, ${documentCount} documents`,
  })

  return toBackupSummary({ ...doc, _id: result.insertedId })
}

/** Writes a stored snapshot back into a database. */
export async function restoreBackup(options: {
  backup: BackupDoc
  connectionId: string
  database: string
  collections?: string[]
  mode: 'append' | 'overwrite' | 'upsert'
}) {
  const connection = await resolveConnection(options.connectionId)
  assertWritable(connection, 'restore')
  const client = await getClient(connection.uri)
  const db = client.db(options.database)

  const payload = JSON.parse(options.backup.payload) as BackupPayload
  const entries = Object.entries(payload.collections).filter(
    ([name]) => !options.collections?.length || options.collections.includes(name),
  )

  const summary: { collection: string; restored: number; skipped: number }[] = []

  for (const [name, rawDocs] of entries) {
    const docs = (rawDocs as unknown[]).map((doc) => EJSON.deserialize(doc as never) as Document)
    const col = db.collection(name)
    if (options.mode === 'overwrite') await col.deleteMany({})
    let restored = 0
    let skipped = 0
    const chunkSize = 500

    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize)
      if (options.mode === 'upsert') {
        const operations = chunk.map((doc) => {
          const { _id, ...rest } = doc
          return _id !== undefined
            ? { replaceOne: { filter: { _id }, replacement: rest, upsert: true } }
            : { insertOne: { document: doc } }
        })
        const result = await col.bulkWrite(operations as never, { ordered: false })
        restored += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0) + (result.insertedCount ?? 0)
      } else {
        try {
          const result = await col.insertMany(chunk, { ordered: false })
          restored += result.insertedCount
        } catch (error) {
          const count = (error as { result?: { insertedCount?: number } }).result?.insertedCount ?? 0
          restored += count
          skipped += chunk.length - count
        }
      }
    }
    summary.push({ collection: name, restored, skipped })
  }

  const restored = summary.reduce((total, row) => total + row.restored, 0)
  await logAudit({
    connectionId: connection.id,
    connectionName: connection.name,
    action: 'backup.restore',
    target: options.database,
    detail: `${summary.length} collections, ${restored} documents (${options.mode})`,
    destructive: options.mode === 'overwrite',
  })

  return { summary, restored }
}
