import { EJSON } from 'bson'
import type { Db, Document } from 'mongodb'
import { getClient } from '@/lib/mongo-pool'
import { fail, ok, route } from '@/lib/server/api'
import { assertWritable, logAudit, resolveConnection } from '@/lib/server/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Mode = 'append' | 'overwrite' | 'upsert'

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else quoted = false
      } else current += char
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      out.push(current)
      current = ''
    } else current += char
  }
  out.push(current)
  return out
}

function coerce(raw: string): unknown {
  const value = raw.trim()
  if (value === '') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+$/.test(value)) {
    const asNumber = Number(value)
    if (Number.isSafeInteger(asNumber)) return asNumber
  }
  if (/^-?\d*\.\d+$/.test(value)) return Number(value)
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

/** Expands `a.b.c` CSV headers back into nested documents. */
function unflatten(row: Record<string, unknown>): Document {
  const out: Document = {}
  for (const [path, value] of Object.entries(row)) {
    const parts = path.split('.')
    let cursor: Record<string, unknown> = out
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = value
      } else {
        cursor[part] = (cursor[part] as Record<string, unknown>) ?? {}
        cursor = cursor[part] as Record<string, unknown>
      }
    })
  }
  return out
}

function parseCsv(text: string): Document[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.trim())
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const row: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      row[header] = coerce(cells[index] ?? '')
    })
    return unflatten(row)
  })
}

/** Recognizes JSON arrays, NDJSON, single documents, and console dump bundles. */
function parsePayload(text: string): { collections: Record<string, Document[]>; bundled: boolean } {
  const trimmed = text.trim()
  if (!trimmed) return { collections: {}, bundled: false }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = EJSON.parse(trimmed, { relaxed: false }) as unknown
      if (Array.isArray(parsed)) return { collections: { __default: parsed as Document[] }, bundled: false }
      const record = parsed as Record<string, unknown>
      if (record.format === 'mongo-console-dump' && record.collections) {
        const entries = Object.entries(record.collections as Record<string, unknown>)
        const collections: Record<string, Document[]> = {}
        for (const [name, docs] of entries) {
          collections[name] = (Array.isArray(docs) ? docs : []).map(
            (doc) => EJSON.deserialize(doc as never) as Document,
          )
        }
        return { collections, bundled: true }
      }
      return { collections: { __default: [parsed as Document] }, bundled: false }
    } catch {
      // Fall through to NDJSON handling.
    }
  }

  const docs = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => EJSON.parse(line, { relaxed: false }) as Document)
  return { collections: { __default: docs }, bundled: false }
}

async function writeDocs(
  db: Db,
  name: string,
  docs: Document[],
  mode: Mode,
): Promise<{ inserted: number; skipped: number; upserted: number }> {
  if (docs.length === 0) return { inserted: 0, skipped: 0, upserted: 0 }
  const col = db.collection(name)
  if (mode === 'overwrite') await col.deleteMany({})

  if (mode === 'upsert') {
    let upserted = 0
    const chunkSize = 500
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize)
      const operations = chunk.map((doc) => {
        const { _id, ...rest } = doc
        return _id !== undefined
          ? { replaceOne: { filter: { _id }, replacement: rest, upsert: true } }
          : { insertOne: { document: doc } }
      })
      const result = await col.bulkWrite(operations as never, { ordered: false })
      upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0) + (result.insertedCount ?? 0)
    }
    return { inserted: 0, skipped: 0, upserted }
  }

  let inserted = 0
  let skipped = 0
  const chunkSize = 500
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize)
    try {
      const result = await col.insertMany(chunk, { ordered: false })
      inserted += result.insertedCount
    } catch (error) {
      const writeError = error as { result?: { insertedCount?: number }; writeErrors?: unknown[] }
      const count = writeError.result?.insertedCount ?? 0
      inserted += count
      skipped += chunk.length - count
    }
  }
  return { inserted, skipped, upserted: 0 }
}

export async function POST(request: Request) {
  return route(async () => {
    const contentType = request.headers.get('content-type') ?? ''
    let connectionId: string | undefined
    let database: string | undefined
    let collection: string | undefined
    let mode: Mode = 'append'
    let format = 'auto'
    let text = ''
    let filename = 'payload'

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      connectionId = form.get('connectionId') as string | undefined
      database = form.get('database') as string | undefined
      collection = (form.get('collection') as string | undefined) || undefined
      mode = ((form.get('mode') as Mode) || 'append') as Mode
      format = (form.get('format') as string) || 'auto'
      const file = form.get('file')
      if (!(file instanceof File)) return fail('Attach a file to import.')
      filename = file.name
      text = await file.text()
    } else {
      const body = (await request.json()) as Record<string, unknown>
      connectionId = body.connectionId as string | undefined
      database = body.database as string | undefined
      collection = (body.collection as string | undefined) || undefined
      mode = ((body.mode as Mode) || 'append') as Mode
      format = (body.format as string) || 'auto'
      text = (body.text as string) ?? ''
    }

    if (!connectionId) return fail('A `connectionId` is required.')
    if (!database) return fail('A target database is required.')
    if (!text.trim()) return fail('The import payload is empty.')

    const connection = await resolveConnection(connectionId)
    assertWritable(connection, 'import')
    const client = await getClient(connection.uri)
    const db = client.db(database)

    const isCsv = format === 'csv' || (format === 'auto' && /\.csv$/i.test(filename))
    let collections: Record<string, Document[]>
    let bundled = false

    if (isCsv) {
      collections = { __default: parseCsv(text) }
    } else {
      const parsed = parsePayload(text)
      collections = parsed.collections
      bundled = parsed.bundled
    }

    if (!bundled && !collection) {
      return fail('Choose a target collection for this file.')
    }

    const summary: { collection: string; inserted: number; skipped: number; upserted: number }[] = []
    for (const [name, docs] of Object.entries(collections)) {
      const target = bundled ? name : (collection as string)
      const result = await writeDocs(db, target, docs, mode)
      summary.push({ collection: target, ...result })
    }

    const inserted = summary.reduce((total, row) => total + row.inserted + row.upserted, 0)
    await logAudit({
      connectionId: connection.id,
      connectionName: connection.name,
      action: 'data.import',
      target: `${database}${collection ? `.${collection}` : ''}`,
      detail: `${inserted} documents from ${filename} (${mode})`,
      destructive: mode === 'overwrite',
    })

    return ok({ summary, inserted, bundled })
  })
}
