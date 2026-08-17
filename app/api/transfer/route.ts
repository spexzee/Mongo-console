import { getClient } from '@/lib/mongo-pool'
import { describeError, fail } from '@/lib/server/api'
import { assertWritable, logAudit, resolveConnection } from '@/lib/server/connections'
import { copyDocuments } from '@/lib/server/operations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type TransferEvent =
  | { type: 'start'; collections: string[]; source: string; target: string }
  | { type: 'collection-start'; collection: string; index: number; total: number }
  | { type: 'progress'; collection: string; copied: number; total: number }
  | { type: 'collection-done'; collection: string; copied: number; total: number; skipped: number }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'done'; copied: number; skipped: number; durationMs: number }
  | { type: 'error'; message: string }

/**
 * Streams a cross-URI collection transfer as newline-delimited JSON events so the
 * client can render live progress without a socket server.
 */
export async function POST(request: Request) {
  let body: {
    sourceConnectionId?: string
    sourceDatabase?: string
    targetConnectionId?: string
    targetDatabase?: string
    collections?: string[]
    mode?: 'append' | 'overwrite' | 'upsert'
    createTargetDatabase?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return fail('Invalid request body.')
  }

  const {
    sourceConnectionId,
    sourceDatabase,
    targetConnectionId,
    targetDatabase,
    collections,
    mode = 'append',
  } = body

  if (!sourceConnectionId || !sourceDatabase) return fail('A source connection and database are required.')
  if (!targetConnectionId || !targetDatabase) return fail('A target connection and database are required.')

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TransferEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      const started = Date.now()
      let totalCopied = 0
      let totalSkipped = 0
      let sourceName = ''
      let targetName = ''

      try {
        const [source, target] = await Promise.all([
          resolveConnection(sourceConnectionId),
          resolveConnection(targetConnectionId),
        ])
        sourceName = source.name
        targetName = target.name
        assertWritable(target, 'transfer')

        const [sourceClient, targetClient] = await Promise.all([
          getClient(source.uri),
          getClient(target.uri),
        ])
        const sourceDb = sourceClient.db(sourceDatabase)
        const targetDb = targetClient.db(targetDatabase)

        const available = (await sourceDb.listCollections({}, { nameOnly: true }).toArray())
          .map((entry) => entry.name)
          .filter((name) => !name.startsWith('system.'))

        const selected =
          collections && collections.length > 0
            ? available.filter((name) => collections.includes(name))
            : available

        if (selected.length === 0) {
          send({ type: 'error', message: 'No matching collections were found in the source database.' })
          controller.close()
          return
        }

        send({
          type: 'start',
          collections: selected,
          source: `${source.name} / ${sourceDatabase}`,
          target: `${target.name} / ${targetDatabase}`,
        })

        for (const [index, name] of selected.entries()) {
          send({ type: 'collection-start', collection: name, index: index + 1, total: selected.length })
          try {
            const result = await copyDocuments({
              source: sourceDb,
              target: targetDb,
              sourceCollection: name,
              targetCollection: name,
              mode,
              onProgress: (copied, total) => {
                send({ type: 'progress', collection: name, copied, total })
              },
            })
            totalCopied += result.copied
            totalSkipped += result.skipped
            send({ type: 'collection-done', collection: name, ...result })
            if (result.skipped > 0) {
              send({
                type: 'log',
                level: 'warn',
                message: `${name}: ${result.skipped} documents skipped (duplicate _id or validation failure).`,
              })
            }
          } catch (error) {
            const { message } = describeError(error)
            send({ type: 'log', level: 'error', message: `${name}: ${message}` })
          }
        }

        const durationMs = Date.now() - started
        send({ type: 'done', copied: totalCopied, skipped: totalSkipped, durationMs })

        await logAudit({
          connectionId: source.id,
          connectionName: source.name,
          action: 'transfer.run',
          target: `${sourceName}/${sourceDatabase} → ${targetName}/${targetDatabase}`,
          detail: `${selected.length} collections, ${totalCopied} documents, mode ${mode}`,
          destructive: mode === 'overwrite',
        })
      } catch (error) {
        const { message } = describeError(error)
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
