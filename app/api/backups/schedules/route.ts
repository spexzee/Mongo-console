import { backupsCol, ensureAppIndexes, schedulesCol } from '@/lib/app-db'
import { fail, ok, route } from '@/lib/server/api'
import { getAuthUser, requireAuth } from '@/lib/server/auth'
import { createBackup } from '@/lib/server/backups'
import { objectId, resolveConnection } from '@/lib/server/connections'
import type { BackupScheduleDoc } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function toSummary(doc: BackupScheduleDoc) {
  return {
    id: String(doc._id),
    userId: doc.userId,
    label: doc.label,
    connectionId: doc.connectionId,
    connectionName: doc.connectionName,
    database: doc.database,
    collections: doc.collections,
    everyHours: doc.everyHours,
    keep: doc.keep,
    enabled: doc.enabled,
    lastRunAt: doc.lastRunAt?.toISOString(),
    lastRunOk: doc.lastRunOk,
    lastRunError: doc.lastRunError,
    nextRunAt: doc.nextRunAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  }
}

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    await ensureAppIndexes()
    const col = await schedulesCol()
    const docs = await col
      .find({
        $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
      } as any)
      .sort({ createdAt: -1 })
      .toArray()
    return ok(docs.map(toSummary))
  })
}

export async function POST(request: Request) {
  return route(async () => {
    const body = (await request.json()) as {
      action?: 'create' | 'toggle' | 'runDue'
      id?: string
      enabled?: boolean
      label?: string
      connectionId?: string
      database?: string
      collections?: string[]
      everyHours?: number
      keep?: number
    }
    const col = await schedulesCol()

    // Runs every schedule whose next run time has passed. Call from external cron.
    if (body.action === 'runDue') {
      const now = new Date()
      const due = await col.find({ enabled: true, nextRunAt: { $lte: now } }).toArray()
      const results: { id: string; label: string; ok: boolean; error?: string }[] = []

      for (const schedule of due) {
        const everyHours = Math.max(schedule.everyHours, 1)
        try {
          await createBackup({
            userId: schedule.userId,
            connectionId: schedule.connectionId,
            database: schedule.database,
            collections: schedule.collections,
            label: `${schedule.label} · ${now.toISOString().replace('T', ' ').slice(0, 16)}`,
            scheduled: true,
          })
          const backups = await backupsCol()
          const older = await backups
            .find(
              { connectionId: schedule.connectionId, database: schedule.database, scheduled: true },
              { projection: { _id: 1 } },
            )
            .sort({ createdAt: -1 })
            .skip(Math.max(schedule.keep, 1))
            .toArray()
          if (older.length > 0) {
            await backups.deleteMany({ _id: { $in: older.map((doc) => doc._id) } })
          }
          await col.updateOne(
            { _id: schedule._id },
            {
              $set: {
                lastRunAt: now,
                lastRunOk: true,
                lastRunError: undefined,
                nextRunAt: new Date(now.getTime() + everyHours * 3_600_000),
              },
            },
          )
          results.push({ id: String(schedule._id), label: schedule.label, ok: true })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await col.updateOne(
            { _id: schedule._id },
            {
              $set: {
                lastRunAt: now,
                lastRunOk: false,
                lastRunError: message,
                nextRunAt: new Date(now.getTime() + everyHours * 3_600_000),
              },
            },
          )
          results.push({ id: String(schedule._id), label: schedule.label, ok: false, error: message })
        }
      }
      return ok({ ran: results.length, results })
    }

    const user = await requireAuth(request)

    if (body.action === 'toggle') {
      if (!body.id) return fail('An `id` is required.')
      await col.updateOne(
        {
          _id: objectId(body.id),
          $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
        } as any,
        { $set: { enabled: Boolean(body.enabled) } },
      )
      return ok({ id: body.id, enabled: Boolean(body.enabled) })
    }

    if (!body.connectionId) return fail('Choose a connection.')
    if (!body.database) return fail('Choose a database.')
    const connection = await resolveConnection(body.connectionId, user.id)
    const everyHours = Math.min(Math.max(Number(body.everyHours ?? 24), 1), 24 * 30)

    const doc: BackupScheduleDoc = {
      userId: user.id,
      label: body.label?.trim() || `${body.database} every ${everyHours}h`,
      connectionId: connection.id,
      connectionName: connection.name,
      database: body.database,
      collections: body.collections ?? [],
      everyHours,
      keep: Math.min(Math.max(Number(body.keep ?? 5), 1), 50),
      enabled: true,
      nextRunAt: new Date(Date.now() + everyHours * 3_600_000),
      createdAt: new Date(),
    }
    const result = await col.insertOne(doc)
    return ok(toSummary({ ...doc, _id: result.insertedId }))
  })
}

export async function DELETE(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return fail('An `id` is required.')
    const col = await schedulesCol()
    await col.deleteOne({
      _id: objectId(id),
      $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
    } as any)
    return ok({ deleted: id })
  })
}
