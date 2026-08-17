import { MongoClient, type Db } from 'mongodb'

type PoolEntry = { client: MongoClient; lastUsed: number }

const globalPool = globalThis as unknown as {
  __mongoConsolePool?: Map<string, PoolEntry>
}

const pool: Map<string, PoolEntry> = (globalPool.__mongoConsolePool ??= new Map())

const IDLE_MS = 1000 * 60 * 10

function reap() {
  const now = Date.now()
  for (const [uri, entry] of pool) {
    if (now - entry.lastUsed > IDLE_MS) {
      pool.delete(uri)
      void entry.client.close().catch(() => {})
    }
  }
}

/** Returns a pooled, connected MongoClient for the given URI. */
export async function getClient(uri: string): Promise<MongoClient> {
  reap()
  const existing = pool.get(uri)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.client
  }
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    maxPoolSize: 10,
    appName: 'mongo-console',
    tls: uri.includes('+srv') || uri.includes('tls=true') || uri.includes('ssl=true') ? true : undefined,
    tlsAllowInvalidCertificates: false,
  })
  await client.connect()
  pool.set(uri, { client, lastUsed: Date.now() })
  return client
}

/** Opens a one-off client that is not pooled — used for connection tests. */
export async function withTempClient<T>(
  uri: string,
  fn: (client: MongoClient) => Promise<T>,
): Promise<T> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    maxPoolSize: 2,
    appName: 'mongo-console-test',
    tls: uri.includes('+srv') || uri.includes('tls=true') || uri.includes('ssl=true') ? true : undefined,
    tlsAllowInvalidCertificates: false,
  })
  try {
    await client.connect()
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}

export async function getDb(uri: string, dbName: string): Promise<Db> {
  const client = await getClient(uri)
  return client.db(dbName)
}

/** Drops a URI from the pool, e.g. after a profile is deleted or edited. */
export async function evict(uri: string) {
  const entry = pool.get(uri)
  if (!entry) return
  pool.delete(uri)
  await entry.client.close().catch(() => {})
}

export function poolSize() {
  return pool.size
}
