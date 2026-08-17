'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import {
  Archive,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  RotateCcw,
  Clock,
  HardDrive,
  Calendar
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useDatabases } from '@/hooks/use-databases'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function BackupsPage() {
  const params = useParams()
  const connId = params.connId as string
  const { databases } = useDatabases(connId)

  const { data: backups, isLoading, mutate } = useSWR(
    [`/api/backups`, connId],
    () => api.backups.list(connId)
  )

  const { data: schedules, mutate: mutateSchedules } = useSWR(
    [`/api/backups/schedules`, connId],
    () => api.backups.schedules.list(connId)
  )

  const [createOpen, setCreateOpen] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [selectedDb, setSelectedDb] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDb) {
      toast.error('Please select a database')
      return
    }
    setIsSubmitting(true)
    try {
      await api.backups.create({
        connectionId: connId,
        database: selectedDb,
        label: label.trim() || `Manual Backup - ${new Date().toLocaleDateString()}`,
      })
      toast.success('Backup snapshot created!')
      setCreateOpen(false)
      setLabel('')
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create backup')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRestore = async (backupId: string) => {
    if (!confirm('Are you sure you want to restore this backup snapshot? Existing collection documents will be overwritten/merged.')) {
      return
    }
    try {
      await api.backups.restore(backupId)
      toast.success('Backup successfully restored!')
    } catch (err: any) {
      toast.error(err.message || 'Restore failed')
    }
  }

  const handleDelete = async (backupId: string) => {
    if (!confirm('Are you sure you want to permanently delete this backup snapshot?')) return
    try {
      await api.backups.delete(backupId)
      toast.success('Backup snapshot deleted')
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete backup')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/connections" className="hover:text-foreground">
              Connections
            </Link>
            <span>/</span>
            <span className="text-foreground">Backups</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Archive className="h-6 w-6 text-primary" />
            Backups & Restore
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Take instant portable Extended JSON snapshots and schedule recurring backups.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              mutate()
              mutateSchedules()
            }}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Backup Snapshot
          </Button>
        </div>
      </div>

      <Tabs defaultValue="snapshots">
        <TabsList>
          <TabsTrigger value="snapshots">Snapshots ({backups?.length || 0})</TabsTrigger>
          <TabsTrigger value="schedules">Schedules ({schedules?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="snapshots" className="mt-4">
          {isLoading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-xl border border-border/40 bg-card/40 animate-pulse p-4" />
              ))}
            </div>
          ) : !backups || backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card/20 space-y-3">
              <Archive className="h-8 w-8 text-muted-foreground opacity-50" />
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">No backup snapshots found</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Create a manual backup to preserve databases before running destructive operations.
                </p>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Take First Backup
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {backups.map((b: any) => (
                <Card key={b._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{b.label}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {b.database}
                      </Badge>
                      {b.scheduled && (
                        <Badge variant="secondary" className="text-[10px]">
                          Scheduled
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                      <span>{b.documentCount} docs</span>
                      <span>•</span>
                      <span>{formatBytes(b.sizeBytes)}</span>
                      <span>•</span>
                      <span>{new Date(b.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(b._id)}
                      className="text-xs h-8 gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(b._id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="schedules" className="mt-4">
          <div className="p-8 text-center border border-dashed rounded-xl text-muted-foreground text-xs">
            Recurring backup schedules will appear here. Set up hourly or daily jobs per database.
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Backup Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleCreateBackup}>
            <DialogHeader>
              <DialogTitle>Create Backup Snapshot</DialogTitle>
              <DialogDescription>
                Snapshots are stored in your app metadata database and can be restored or downloaded at any time.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="db">Database to Backup</Label>
                <Select value={selectedDb} onValueChange={(val: string | null) => setSelectedDb(val || '')} required>
                  <SelectTrigger id="db" className="font-mono text-xs">
                    <SelectValue placeholder="Select Database" />
                  </SelectTrigger>
                  <SelectContent>
                    {databases.map((d) => (
                      <SelectItem key={d.name} value={d.name} className="font-mono text-xs">
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="label">Backup Label</Label>
                <Input
                  id="label"
                  placeholder="e.g. Pre-migration snapshot"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting || !selectedDb}>
                {isSubmitting ? 'Creating Snapshot...' : 'Take Snapshot'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
