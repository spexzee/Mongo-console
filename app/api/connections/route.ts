import { connectionsCol, ensureAppIndexes } from '@/lib/app-db'
import { encryptSecret, redactUri, uriHost } from '@/lib/crypto'
import { fail, ok, route } from '@/lib/server/api'
import { requireAuth } from '@/lib/server/auth'
import { logAudit, toSummary } from '@/lib/server/connections'
import type { ConnectionDoc } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLORS = ['amber', 'teal', 'violet', 'rose', 'lime', 'sky']

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    await ensureAppIndexes()
    const col = await connectionsCol()
    // Find connections owned by this user or unassigned legacy connections
    const docs = await col
      .find({
        $or: [{ userId: user.id }, { userId: { $exists: false } }, { userId: null }],
      } as any)
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .toArray()
    return ok(docs.map(toSummary))
  })
}

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireAuth(request)
    const body = (await request.json()) as {
      name?: string
      uri?: string
      defaultDatabase?: string
      color?: string
      readOnly?: boolean
      notes?: string
    }

    const name = body.name?.trim()
    const uri = body.uri?.trim()

    if (!name) return fail('A profile name is required.')
    if (!uri) return fail('A MongoDB connection URI is required.')
    if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
      return fail('The URI must start with `mongodb://` or `mongodb+srv://`.')
    }

    await ensureAppIndexes()
    const col = await connectionsCol()

    const existing = await col.findOne({
      name,
      $or: [{ userId: user.id }, { userId: { $exists: false } }],
    } as any)
    if (existing) return fail(`A profile named “${name}” already exists in your account.`, 409)

    const doc: ConnectionDoc = {
      userId: user.id,
      name,
      uriEncrypted: encryptSecret(uri),
      host: uriHost(uri),
      uriRedacted: redactUri(uri),
      defaultDatabase: body.defaultDatabase?.trim() || undefined,
      color: COLORS.includes(body.color ?? '') ? (body.color as string) : COLORS[0],
      readOnly: Boolean(body.readOnly),
      notes: body.notes?.trim() || undefined,
      createdAt: new Date(),
    }

    const result = await col.insertOne(doc)
    await logAudit({
      userId: user.id,
      userName: user.name,
      connectionId: String(result.insertedId),
      connectionName: name,
      action: 'connection.create',
      target: doc.host,
      detail: doc.readOnly ? 'Saved as read-only' : 'Saved with write access',
    })

    return ok(toSummary({ ...doc, _id: result.insertedId }), { status: 201 })
  })
}
