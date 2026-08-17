import { connectionsCol, favoritesCol } from '@/lib/app-db'
import { decryptSecret, encryptSecret, redactUri, uriHost } from '@/lib/crypto'
import { evict } from '@/lib/mongo-pool'
import { fail, ok, route } from '@/lib/server/api'
import { logAudit, objectId, toSummary } from '@/lib/server/connections'
import type { ConnectionDoc } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  return route(async () => {
    const { id } = await params
    const col = await connectionsCol()
    const doc = await col.findOne({ _id: objectId(id) })
    if (!doc) return fail('Connection profile not found.', 404)
    return ok(toSummary(doc))
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { id } = await params
    const body = (await request.json()) as Partial<{
      name: string
      uri: string
      defaultDatabase: string
      color: string
      readOnly: boolean
      notes: string
    }>

    const col = await connectionsCol()
    const current = await col.findOne({ _id: objectId(id) })
    if (!current) return fail('Connection profile not found.', 404)

    const update: Partial<ConnectionDoc> = {}
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return fail('A profile name is required.')
      const clash = await col.findOne({ name, _id: { $ne: current._id } })
      if (clash) return fail(`A profile named “${name}” already exists.`, 409)
      update.name = name
    }
    if (body.uri !== undefined && body.uri.trim()) {
      const uri = body.uri.trim()
      if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
        return fail('The URI must start with `mongodb://` or `mongodb+srv://`.')
      }
      await evict(decryptSecret(current.uriEncrypted)).catch(() => {})
      update.uriEncrypted = encryptSecret(uri)
      update.host = uriHost(uri)
      update.uriRedacted = redactUri(uri)
    }
    if (body.defaultDatabase !== undefined) {
      update.defaultDatabase = body.defaultDatabase.trim() || undefined
    }
    if (body.color !== undefined) update.color = body.color
    if (body.readOnly !== undefined) update.readOnly = Boolean(body.readOnly)
    if (body.notes !== undefined) update.notes = body.notes.trim() || undefined

    await col.updateOne({ _id: current._id }, { $set: update })
    const updated = await col.findOne({ _id: current._id })

    await logAudit({
      connectionId: id,
      connectionName: updated?.name,
      action: 'connection.update',
      target: updated?.host ?? '',
      detail: Object.keys(update)
        .map((key) => (key === 'uriEncrypted' ? 'uri' : key))
        .join(', '),
    })

    return ok(toSummary(updated as ConnectionDoc))
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    const { id } = await params
    const col = await connectionsCol()
    const doc = await col.findOne({ _id: objectId(id) })
    if (!doc) return fail('Connection profile not found.', 404)

    await evict(decryptSecret(doc.uriEncrypted)).catch(() => {})
    await col.deleteOne({ _id: doc._id })
    const favorites = await favoritesCol()
    await favorites.deleteMany({ connectionId: id }).catch(() => {})

    await logAudit({
      connectionId: id,
      connectionName: doc.name,
      action: 'connection.delete',
      target: doc.host,
      destructive: true,
    })

    return ok({ deleted: id })
  })
}
