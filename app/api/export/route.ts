import { EJSON } from 'bson'
import type { Db, Document } from 'mongodb'
import { getClient } from '@/lib/mongo-pool'
import { parseRelaxed } from '@/lib/mongo-shell'
import { flatten, toNdjson } from '@/lib/ejson'
import { fail, route } from '@/lib/server/api'
import { logAudit, resolveConnection } from '@/lib/server/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Format = 'json' | 'ndjson' | 'csv' | 'bson' | 'dump'

const MIME: Record<Format, string> = {
  json: 'application/json; charset=utf-8',
  ndjson: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  bson: 'application/octet-stream',
  dump: 'application/json; charset=utf-8',
}

const EXT: Record<Format, string> = {
  json: 'json',
  ndjson: 'ndjson',
  csv: 'csv',
  bson: 'bson.json',
  dump: 'dump.json',
}

function toCsv(docs: Document[]): string {
  if (docs.length === 0) return ''
  const rows = docs.map((doc) => flatten(JSON.parse(EJSON.stringify(doc as never)) as Document))
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const escape = (value: unknown) => {
    if (value === undefined || value === null) return ''
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(','))
  return lines.join('\n')
}

async function readCollection(
  db: Db,
  name: string,
  filter: Document,
  limit: number,
): Promise<Document[]> {
  const cursor = db.collection(name).find(filter).maxTimeMS(120_000)
  if (limit > 0) cursor.limit(limit)
  return cursor.toArray()
}

export async function POST(request: Request) {
  return route(async () => {
    const body = (await request.json()) as {
      connectionId?: string
      database?: string
      collections?: string[]
      collection?: string
      documents?: unknown[]
      format?: Format
      filter?: string
      limit?: number
    }

    const format = body.format ?? 'json'
    if (!MIME[format]) return fail(`Unsupported format \`${format}\`.`)

    // Direct payload export (used by "export these query results").
    if (Array.isArray(body.documents)) {
      const docs = body.documents as Document[]
      const payload =
        format === 'csv'
          ? toCsv(docs)
          : format === 'ndjson'
            ? toNdjson(docs)
            : JSON.stringify(docs, null, 2)
      return new Response(payload, {
        headers: {
          'Content-Type': MIME[format],
          'Content-Disposition': `attachment; filename="results.${EXT[format]}"`,
        },
      })
    }

    if (!body.connectionId) return fail('A `connectionId` is required.')
    if (!body.database) return fail('A `database` is required.')

    const connection = await resolveConnection(body.connectionId)
    const client = await getClient(connection.uri)
    const db = client.db(body.database)
    const filter = body.filter?.trim() ? parseRelaxed<Document>(body.filter, {}) : {}
    const limit = Number(body.limit ?? 0)

    const names =
      body.collections && body.collections.length > 0
        ? body.collections
        : body.collection
          ? [body.collection]
          : (await db.listCollections({}, { nameOnly: true }).toArray())
              .map((entry) => entry.name)
              .filter((name) => !name.startsWith('system.'))

    if (names.length === 0) return fail('There are no collections to export.')

    const single = names.length === 1
    let payload: string
    let filename: string

    if (single && format !== 'dump') {
      const docs = await readCollection(db, names[0], filter, limit)
      payload =
        format === 'csv' ? toCsv(docs) : format === 'ndjson' ? toNdjson(docs) : EJSON.stringify(docs, undefined, 2)
      filename = `${body.database}.${names[0]}.${EXT[format]}`
    } else {
      const bundle: Record<string, unknown> = {}
      let total = 0
      for (const name of names) {
        const docs = await readCollection(db, name, filter, limit)
        total += docs.length
        bundle[name] = JSON.parse(EJSON.stringify(docs as never))
      }
      if (format === 'csv') {
        // CSV cannot express multiple collections; emit one section per collection.
        payload = names
          .map((name) => `# ${name}\n${toCsv((bundle[name] as Document[]) ?? [])}`)
          .join('\n\n')
      } else {
        payload = JSON.stringify(
          {
            format: 'mongo-console-dump',
            version: 1,
            database: body.database,
            exportedAt: new Date().toISOString(),
            documentCount: total,
            collections: bundle,
          },
          null,
          2,
        )
      }
      filename = `${body.database}.${format === 'csv' ? 'csv' : EXT.dump}`
    }

    await logAudit({
      connectionId: connection.id,
      connectionName: connection.name,
      action: 'data.export',
      target: `${body.database}${single ? `.${names[0]}` : ''}`,
      detail: `${names.length} collection(s) as ${format}`,
    })

    return new Response(payload, {
      headers: {
        'Content-Type': MIME[format],
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
