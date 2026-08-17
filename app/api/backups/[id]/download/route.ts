import { backupsCol } from '@/lib/app-db'
import { fail, route } from '@/lib/server/api'
import { objectId } from '@/lib/server/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { id } = await params
    const col = await backupsCol()
    const backup = await col.findOne({ _id: objectId(id) })
    if (!backup) return fail('That backup no longer exists.', 404)

    const safeLabel = backup.label.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
    return new Response(backup.payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeLabel || 'backup'}.backup.json"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
