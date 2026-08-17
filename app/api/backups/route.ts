import { backupsCol, ensureAppIndexes } from '@/lib/app-db'
import { fail, ok, route } from '@/lib/server/api'
import { createBackup, restoreBackup, toBackupSummary } from '@/lib/server/backups'
import { objectId } from '@/lib/server/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return route(async () => {
    await ensureAppIndexes()
    const url = new URL(request.url)
    const connectionId = url.searchParams.get('connectionId')
    const col = await backupsCol()
    const docs = await col
      .find(connectionId ? { connectionId } : {}, { projection: { payload: 0 } })
      .sort({ createdAt: -1 })
      .limit(60)
      .toArray()
    return ok(docs.map((doc) => toBackupSummary({ ...doc, payload: '' })))
  })
}

export async function POST(request: Request) {
  return route(async () => {
    const body = (await request.json()) as {
      action?: 'create' | 'restore'
      connectionId?: string
      database?: string
      collections?: string[]
      label?: string
      backupId?: string
      mode?: 'append' | 'overwrite' | 'upsert'
    }

    if (body.action === 'restore') {
      if (!body.backupId) return fail('A `backupId` is required.')
      if (!body.connectionId) return fail('Choose a target connection.')
      if (!body.database) return fail('Choose a target database.')
      const col = await backupsCol()
      const backup = await col.findOne({ _id: objectId(body.backupId) })
      if (!backup) return fail('That backup no longer exists.', 404)
      const result = await restoreBackup({
        backup,
        connectionId: body.connectionId,
        database: body.database,
        collections: body.collections,
        mode: body.mode ?? 'upsert',
      })
      return ok(result)
    }

    if (!body.connectionId) return fail('A `connectionId` is required.')
    if (!body.database) return fail('A `database` is required.')
    const summary = await createBackup({
      connectionId: body.connectionId,
      database: body.database,
      collections: body.collections,
      label: body.label,
    })
    return ok(summary)
  })
}

export async function DELETE(request: Request) {
  return route(async () => {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return fail('An `id` is required.')
    const col = await backupsCol()
    await col.deleteOne({ _id: objectId(id) })
    return ok({ deleted: id })
  })
}
