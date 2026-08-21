import type { ObjectId } from 'mongodb'

export type UserDoc = {
  _id?: ObjectId
  email: string
  name: string
  passwordHash: string
  salt: string
  createdAt: Date
  lastLoginAt?: Date
}

export type AuthUser = {
  id: string
  email: string
  name: string
}

export type UserSummary = {
  id: string
  email: string
  name: string
  createdAt: string
}

export type ConnectionDoc = {
  _id?: ObjectId
  userId?: string
  name: string
  /** AES-256-GCM encrypted connection URI. Never returned to the client. */
  uriEncrypted: string
  /** Host portion of the URI, safe to display. */
  host: string
  /** Redacted URI safe to display. */
  uriRedacted: string
  /** Default database to select when the connection is opened. */
  defaultDatabase?: string
  color: string
  readOnly: boolean
  notes?: string
  createdAt: Date
  lastUsedAt?: Date
}

/** Shape sent to the browser — never contains the URI or credentials. */
export type ConnectionSummary = {
  id: string
  userId?: string
  name: string
  host: string
  uriRedacted: string
  defaultDatabase?: string
  color: string
  readOnly: boolean
  notes?: string
  createdAt: string
  lastUsedAt?: string
}

export type QueryHistoryDoc = {
  _id?: ObjectId
  userId?: string
  connectionId: string
  connectionName: string
  database: string
  collection?: string
  command: string
  operation: string
  durationMs: number
  ok: boolean
  error?: string
  resultCount?: number
  createdAt: Date
}

export type SavedQueryDoc = {
  _id?: ObjectId
  userId?: string
  name: string
  description?: string
  connectionId?: string
  database?: string
  collection?: string
  command: string
  createdAt: Date
}

export type AuditLogDoc = {
  _id?: ObjectId
  userId?: string
  userName?: string
  connectionId?: string
  connectionName?: string
  action: string
  target: string
  detail?: string
  destructive: boolean
  ok: boolean
  error?: string
  createdAt: Date
}

export type FavoriteDoc = {
  _id?: ObjectId
  userId?: string
  connectionId: string
  connectionName: string
  database: string
  collection: string
  createdAt: Date
}

export type BackupDoc = {
  _id?: ObjectId
  userId?: string
  label: string
  connectionId: string
  connectionName: string
  database: string
  collections: { name: string; count: number }[]
  /** Newline-delimited extended-JSON payload per collection, gzip-free for portability. */
  payload: string
  sizeBytes: number
  documentCount: number
  createdAt: Date
  scheduled: boolean
}

export type BackupScheduleDoc = {
  _id?: ObjectId
  userId?: string
  label: string
  connectionId: string
  connectionName: string
  database: string
  collections: string[]
  /** Interval in hours between runs. */
  everyHours: number
  /** Maximum number of backups to retain for this schedule. */
  keep: number
  enabled: boolean
  lastRunAt?: Date
  lastRunOk?: boolean
  lastRunError?: string
  nextRunAt: Date
  createdAt: Date
}

export type CollectionInfo = {
  name: string
  type: string
  count: number
  sizeBytes: number
  storageSizeBytes: number
  avgObjSize: number
  indexCount: number
  indexSizeBytes: number
  capped: boolean
}

export type DatabaseInfo = {
  name: string
  sizeOnDisk: number
  empty: boolean
  collectionCount?: number
}

export type SchemaField = {
  path: string
  types: { type: string; count: number }[]
  presentIn: number
  missingIn: number
  coverage: number
  samples: string[]
}
