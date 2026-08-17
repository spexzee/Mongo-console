import { ObjectId } from 'mongodb'
import { auditCol, connectionsCol, ensureAppIndexes } from '@/lib/app-db'
import { decryptSecret } from '@/lib/crypto'
import type { ConnectionDoc, ConnectionSummary } from '@/lib/types'

export type ResolvedConnection = {
  id: string
  name: string
  uri: string
  readOnly: boolean
  doc: ConnectionDoc
}

export function toSummary(doc: ConnectionDoc): ConnectionSummary {
  return {
    id: String(doc._id),
    name: doc.name,
    host: doc.host,
    uriRedacted: doc.uriRedacted,
    defaultDatabase: doc.defaultDatabase,
    color: doc.color,
    readOnly: doc.readOnly,
    notes: doc.notes,
    createdAt: doc.createdAt.toISOString(),
    lastUsedAt: doc.lastUsedAt?.toISOString(),
  }
}

export function objectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new Error(`\`${id}\` is not a valid connection id.`)
  return new ObjectId(id)
}

/** Loads a saved connection and decrypts its URI for server-side use only. */
export async function resolveConnection(id: string): Promise<ResolvedConnection> {
  await ensureAppIndexes()
  const col = await connectionsCol()
  const doc = await col.findOne({ _id: objectId(id) })
  if (!doc) throw new Error('Connection profile not found.')
  void col.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {})
  return {
    id: String(doc._id),
    name: doc.name,
    uri: decryptSecret(doc.uriEncrypted),
    readOnly: doc.readOnly,
    doc,
  }
}

const MUTATING = new Set([
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'bulkWrite',
  'drop',
  'dropDatabase',
  'createCollection',
  'createIndex',
  'createIndexes',
  'dropIndex',
  'dropIndexes',
  'renameCollection',
  'insert',
  'update',
  'remove',
  'save',
])

export function isMutatingOperation(operation: string): boolean {
  return MUTATING.has(operation)
}

/** Throws when a write is attempted against a read-only connection profile. */
export function assertWritable(connection: ResolvedConnection, operation: string) {
  if (connection.readOnly) {
    throw new Error(
      `\`${connection.name}\` is marked read-only. Disable read-only mode on the profile to run \`${operation}\`.`,
    )
  }
}

export async function logAudit(entry: {
  connectionId?: string
  connectionName?: string
  action: string
  target: string
  detail?: string
  destructive?: boolean
  ok?: boolean
  error?: string
}) {
  try {
    const col = await auditCol()
    await col.insertOne({
      connectionId: entry.connectionId,
      connectionName: entry.connectionName,
      action: entry.action,
      target: entry.target,
      detail: entry.detail,
      destructive: entry.destructive ?? false,
      ok: entry.ok ?? true,
      error: entry.error,
      createdAt: new Date(),
    })
  } catch (error) {
    console.log('[v0] audit log write failed:', error instanceof Error ? error.message : error)
  }
}
