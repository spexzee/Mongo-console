import { MongoClient, type Collection, type Db } from 'mongodb'
import type {
  AuditLogDoc,
  BackupDoc,
  BackupScheduleDoc,
  ConnectionDoc,
  FavoriteDoc,
  QueryHistoryDoc,
  SavedQueryDoc,
} from './types'

const globalStore = globalThis as unknown as {
  __mongoConsoleAppClient?: Promise<MongoClient>
}

function appUri(): string {
  const uri = process.env.APP_MONGODB_URI
  if (!uri) {
    throw new Error(
      'APP_MONGODB_URI is not set. It is required to store connection profiles, history and logs.',
    )
  }
  return uri
}

/** Database name for the console's own metadata, taken from the URI path or defaulted. */
function appDbName(uri: string): string {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i)
  const fromUri = match?.[1]?.trim()
  return fromUri && fromUri.length > 0 ? decodeURIComponent(fromUri) : 'mongo_console'
}

async function connect(): Promise<MongoClient> {
  const uri = appUri()
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    appName: 'mongo-console-app',
    tls: uri.includes('+srv') || uri.includes('tls=true') || uri.includes('ssl=true') ? true : undefined,
    tlsAllowInvalidCertificates: false,
  })
  await client.connect()
  return client
}

export async function appDb(): Promise<Db> {
  globalStore.__mongoConsoleAppClient ??= connect()
  let client: MongoClient
  try {
    client = await globalStore.__mongoConsoleAppClient
  } catch (error) {
    globalStore.__mongoConsoleAppClient = undefined
    throw error
  }
  return client.db(appDbName(appUri()))
}

export async function connectionsCol(): Promise<Collection<ConnectionDoc>> {
  const db = await appDb()
  return db.collection<ConnectionDoc>('connections')
}

export async function historyCol(): Promise<Collection<QueryHistoryDoc>> {
  const db = await appDb()
  return db.collection<QueryHistoryDoc>('query_history')
}

export async function savedQueriesCol(): Promise<Collection<SavedQueryDoc>> {
  const db = await appDb()
  return db.collection<SavedQueryDoc>('saved_queries')
}

export async function auditCol(): Promise<Collection<AuditLogDoc>> {
  const db = await appDb()
  return db.collection<AuditLogDoc>('audit_logs')
}

export async function favoritesCol(): Promise<Collection<FavoriteDoc>> {
  const db = await appDb()
  return db.collection<FavoriteDoc>('favorites')
}

export async function backupsCol(): Promise<Collection<BackupDoc>> {
  const db = await appDb()
  return db.collection<BackupDoc>('backups')
}

export async function schedulesCol(): Promise<Collection<BackupScheduleDoc>> {
  const db = await appDb()
  return db.collection<BackupScheduleDoc>('backup_schedules')
}

let indexesEnsured = false

/** Creates the indexes the console relies on. Safe to call repeatedly. */
export async function ensureAppIndexes() {
  if (indexesEnsured) return
  const [connections, history, saved, audit, favorites, backups, schedules] = await Promise.all([
    connectionsCol(),
    historyCol(),
    savedQueriesCol(),
    auditCol(),
    favoritesCol(),
    backupsCol(),
    schedulesCol(),
  ])
  await Promise.all([
    connections.createIndex({ name: 1 }, { unique: true }),
    connections.createIndex({ lastUsedAt: -1 }),
    history.createIndex({ createdAt: -1 }),
    history.createIndex({ connectionId: 1, createdAt: -1 }),
    saved.createIndex({ name: 1 }, { unique: true }),
    audit.createIndex({ createdAt: -1 }),
    audit.createIndex({ connectionId: 1, createdAt: -1 }),
    favorites.createIndex(
      { connectionId: 1, database: 1, collection: 1 },
      { unique: true },
    ),
    backups.createIndex({ createdAt: -1 }),
    backups.createIndex({ connectionId: 1, database: 1, createdAt: -1 }),
    schedules.createIndex({ nextRunAt: 1 }),
  ]).catch(() => {
    // Index creation is best-effort; a read-only app database should not break the console.
  })
  indexesEnsured = true
}
