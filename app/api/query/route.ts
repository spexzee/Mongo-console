import { historyCol } from '@/lib/app-db'
import { getClient } from '@/lib/mongo-pool'
import { parseCommand } from '@/lib/mongo-shell'
import { describeError, fail, ok, route } from '@/lib/server/api'
import {
  assertWritable,
  isMutatingOperation,
  logAudit,
  resolveConnection,
} from '@/lib/server/connections'
import { executeCommand } from '@/lib/server/query-exec'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  return route(async () => {
    const body = (await request.json()) as {
      connectionId?: string
      database?: string
      command?: string
    }

    if (!body.connectionId) return fail('A `connectionId` is required.')
    if (!body.database) return fail('Select a database before running a command.')
    const source = body.command?.trim()
    if (!source) return fail('Enter a command to run.')

    const connection = await resolveConnection(body.connectionId)
    const client = await getClient(connection.uri)
    const db = client.db(body.database)

    const command = parseCommand(source)
    if (isMutatingOperation(command.operation)) {
      assertWritable(connection, command.operation)
    }

    const started = performance.now()
    try {
      const result = await executeCommand(db, command)
      const durationMs = Math.round((performance.now() - started) * 100) / 100

      const history = await historyCol()
      await history
        .insertOne({
          connectionId: connection.id,
          connectionName: connection.name,
          database: body.database,
          collection: command.collection,
          command: source,
          operation: command.operation,
          durationMs,
          ok: true,
          resultCount: result.count,
          createdAt: new Date(),
        })
        .catch(() => {})

      if (isMutatingOperation(command.operation)) {
        await logAudit({
          connectionId: connection.id,
          connectionName: connection.name,
          action: `query.${command.operation}`,
          target: `${body.database}${command.collection ? `.${command.collection}` : ''}`,
          detail: source.slice(0, 240),
          destructive: /drop|delete|remove/i.test(command.operation),
        })
      }

      return ok({
        ...result,
        durationMs,
        operation: command.operation,
        collection: command.collection,
      })
    } catch (error) {
      const { message, status } = describeError(error)
      const durationMs = Math.round((performance.now() - started) * 100) / 100
      const history = await historyCol()
      await history
        .insertOne({
          connectionId: connection.id,
          connectionName: connection.name,
          database: body.database,
          collection: command.collection,
          command: source,
          operation: command.operation,
          durationMs,
          ok: false,
          error: message,
          createdAt: new Date(),
        })
        .catch(() => {})
      return fail(message, status, { durationMs })
    }
  })
}
