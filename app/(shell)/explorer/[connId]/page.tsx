'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  HardDrive,
  TableProperties,
  ArrowRight,
  FolderTree,
  FileCode
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useDatabases } from '@/hooks/use-databases'
import type { DatabaseInfo } from '@/lib/types'
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

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function DatabasesExplorerPage() {
  const params = useParams()
  const connId = params.connId as string
  const router = useRouter()
  const { databases, isLoading, mutate } = useDatabases(connId)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [newDbName, setNewDbName] = React.useState('')
  const [seedCol, setSeedCol] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDbName.trim()) return
    setIsSubmitting(true)
    try {
      await api.db({
        connectionId: connId,
        database: newDbName.trim(),
        seedCollection: seedCol.trim() || undefined,
        action: 'createDatabase',
      })
      toast.success(`Database "${newDbName}" created`)
      setCreateOpen(false)
      setNewDbName('')
      setSeedCol('')
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create database')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDrop = async (dbName: string) => {
    if (!confirm(`Are you sure you want to completely DROP database "${dbName}"? This action cannot be undone.`)) {
      return
    }
    try {
      await api.db({
        connectionId: connId,
        database: dbName,
        action: 'dropDatabase',
      })
      toast.success(`Database "${dbName}" dropped`)
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to drop database')
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
            <span className="text-foreground">Explorer</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Database Explorer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse databases and allocate collections for this connection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Database
          </Button>
        </div>
      </div>

      {/* Grid of Databases */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 rounded-xl border border-border/40 bg-card/40 animate-pulse p-4 space-y-3"
            >
              <div className="h-4 w-1/3 bg-muted/60 rounded" />
              <div className="h-3 w-1/2 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
      ) : databases.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card/20 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Database className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">No databases found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create a database or seed data to begin managing collections.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Database
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {databases.map((db: DatabaseInfo) => {
            const isSystem = ['admin', 'local', 'config'].includes(db.name)
            return (
              <Card key={db.name} className="flex flex-col justify-between hover:border-primary/50 transition-all shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold font-mono leading-none">
                          {db.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatBytes(db.sizeOnDisk)} on disk
                        </p>
                      </div>
                    </div>

                    {isSystem ? (
                      <Badge variant="secondary" className="text-[10px]">
                        System
                      </Badge>
                    ) : db.empty ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Empty
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="pb-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between py-1 border-t border-border/40">
                    <span>Size</span>
                    <span className="font-mono text-foreground">{formatBytes(db.sizeOnDisk)}</span>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                  {!isSystem ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDrop(db.name)}
                      className="text-xs text-destructive hover:text-destructive h-8 px-2"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Drop
                    </Button>
                  ) : <div />}

                  <Button
                    size="sm"
                    className="text-xs h-8"
                    render={<Link href={`/explorer/${connId}/${db.name}`} />}
                  >
                    Browse Collections
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Database Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create New Database</DialogTitle>
              <DialogDescription>
                MongoDB requires at least one collection to persist a new database on disk.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="dbName">Database Name</Label>
                <Input
                  id="dbName"
                  placeholder="e.g. analytics, e_commerce"
                  value={newDbName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDbName(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="seedCol">Initial Collection Name</Label>
                <Input
                  id="seedCol"
                  placeholder="documents (default)"
                  value={seedCol}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeedCol(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Database'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
