'use client'

import React from 'react'
import Link from 'next/link'
import {
  Server,
  Activity,
  MoreVertical,
  Edit2,
  Trash2,
  Copy,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  FolderTree,
  Terminal,
  Clock,
  Radio
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import type { ConnectionSummary } from '@/lib/types'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConnectionFormDialog } from './connection-form'

export function ConnectionCard({
  connection,
  onUpdate,
}: {
  connection: ConnectionSummary
  onUpdate: () => void
}) {
  const [openEdit, setOpenEdit] = React.useState(false)
  const [isTesting, setIsTesting] = React.useState(false)
  const [healthStatus, setHealthStatus] = React.useState<{
    reachable?: boolean
    latencyMs?: number
  } | null>(null)

  const testHealth = async () => {
    setIsTesting(true)
    try {
      const res = await api.db({
        connectionId: connection.id,
        action: 'health',
      })
      setHealthStatus(res)
      if (res.reachable) {
        toast.success(`Connected (${res.latencyMs}ms)`)
      } else {
        toast.error('Connection failed')
      }
    } catch (err: any) {
      toast.error(err.message || 'Health check failed')
      setHealthStatus({ reachable: false })
    } finally {
      setIsTesting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete profile "${connection.name}"?`)) return
    try {
      await api.connections.delete(connection.id)
      toast.success('Connection profile deleted')
      onUpdate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete connection')
    }
  }

  const colorClasses: Record<string, string> = {
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    teal: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
    violet: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    lime: 'bg-lime-500/10 text-lime-500 border-lime-500/20',
    sky: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  }

  return (
    <>
      <Card className="flex flex-col justify-between hover:border-primary/50 transition-all shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={`h-3 w-3 rounded-full ${
                  connection.color ? `bg-${connection.color}-500` : 'bg-primary'
                }`}
              />
              <div>
                <CardTitle className="text-base font-semibold leading-none truncate max-w-[180px]">
                  {connection.name}
                </CardTitle>
                <p className="text-xs font-mono text-muted-foreground mt-1 truncate max-w-[200px]">
                  {connection.host}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {connection.readOnly ? (
                <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                  Read-Only
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                  Read/Write
                </Badge>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="h-7 w-7" />
                  }
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 text-xs">
                  <DropdownMenuItem onClick={() => setOpenEdit(true)} className="gap-2">
                    <Edit2 className="h-3.5 w-3.5" /> Edit Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={testHealth} className="gap-2">
                    <Activity className="h-3.5 w-3.5" /> Ping Health
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="gap-2 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-3 text-xs">
          <div className="rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground truncate">
            {connection.uriRedacted}
          </div>

          <div className="flex items-center justify-between text-muted-foreground text-[11px]">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>
                {connection.lastUsedAt
                  ? `Used ${new Date(connection.lastUsedAt).toLocaleDateString()}`
                  : 'Never used'}
              </span>
            </div>
            {healthStatus?.latencyMs !== undefined && (
              <div className="flex items-center gap-1 text-emerald-500 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {healthStatus.latencyMs}ms
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={testHealth}
            disabled={isTesting}
            className="text-xs h-8"
          >
            <Activity className={`h-3 w-3 mr-1.5 ${isTesting ? 'animate-spin' : ''}`} />
            Test
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="text-xs h-8"
              render={<Link href={`/explorer/${connection.id}`} />}
            >
              <FolderTree className="h-3 w-3 mr-1.5" />
              Open
            </Button>
          </div>
        </CardFooter>
      </Card>

      <ConnectionFormDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        connection={connection}
        onSuccess={() => {
          onUpdate()
          setOpenEdit(false)
        }}
      />
    </>
  )
}
