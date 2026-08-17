'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  TableProperties,
  Plus,
  RefreshCw,
  Trash2,
  Copy,
  ArrowRight,
  Database,
  Search,
  Key,
  Layers,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useCollections } from '@/hooks/use-collections'
import type { CollectionInfo } from '@/lib/types'
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

export default function CollectionsExplorerPage() {
  const params = useParams()
  const connId = params.connId as string
  const dbName = params.db as string
  const router = useRouter()
  const { collections, isLoading, mutate } = useCollections(connId, dbName)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [newColName, setNewColName] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newColName.trim()) return
    setIsSubmitting(true)
    try {
      await api.db({
        connectionId: connId,
        database: dbName,
        collection: newColName.trim(),
        action: 'createCollection',
      })
      toast.success(`Collection "${newColName}" created`)
      setCreateOpen(false)
      setNewColName('')
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create collection')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDrop = async (colName: string) => {
    if (!confirm(`Are you sure you want to DROP collection "${colName}"?`)) return
    try {
      await api.db({
        connectionId: connId,
        database: dbName,
        collection: colName,
        action: 'dropCollection',
      })
      toast.success(`Collection "${colName}" dropped`)
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to drop collection')
    }
  }

  const filteredCols = collections.filter((c: CollectionInfo) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

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
            <Link href={`/explorer/${connId}`} className="hover:text-foreground">
              Explorer
            </Link>
            <span>/</span>
            <span className="text-foreground font-mono">{dbName}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 font-mono">
            <Database className="h-6 w-6 text-primary" />
            {dbName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage collections, indexes, schemas and documents.
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
            New Collection
          </Button>
        </div>
      </div>

      {/* Filter / Search bar */}
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collections..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Grid of Collections */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-border/40 bg-card/40 animate-pulse p-4 space-y-3"
            >
              <div className="h-4 w-1/3 bg-muted/60 rounded" />
              <div className="h-3 w-1/2 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
      ) : filteredCols.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card/20 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <TableProperties className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">No collections found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create a collection to start storing documents in this database.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Collection
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCols.map((col: CollectionInfo) => (
            <Card key={col.name} className="flex flex-col justify-between hover:border-primary/50 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-secondary text-foreground">
                      <TableProperties className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold font-mono leading-none truncate max-w-[170px]">
                        {col.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {col.count.toLocaleString()} docs
                      </p>
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[10px] font-mono">
                    {formatBytes(col.sizeBytes)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-1.5 pb-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Storage Size</span>
                  <span className="font-mono text-foreground">{formatBytes(col.storageSizeBytes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Indexes</span>
                  <span className="font-mono text-foreground">{col.indexCount} ({formatBytes(col.indexSizeBytes)})</span>
                </div>
              </CardContent>

              <CardFooter className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    render={<Link href={`/indexes/${connId}/${dbName}/${col.name}`} />}
                  >
                    <Key className="h-3 w-3 mr-1" /> Indexes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    render={<Link href={`/schema/${connId}/${dbName}/${col.name}`} />}
                  >
                    <Sparkles className="h-3 w-3 mr-1" /> Schema
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="text-xs h-8"
                  render={<Link href={`/${connId}/${dbName}/${col.name}`} />}
                >
                  Documents
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Collection Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create New Collection</DialogTitle>
              <DialogDescription>
                Add a new collection to database <span className="font-mono font-semibold">{dbName}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="colName">Collection Name</Label>
                <Input
                  id="colName"
                  placeholder="e.g. users, orders, logs"
                  value={newColName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColName(e.target.value)}
                  required
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
                {isSubmitting ? 'Creating...' : 'Create Collection'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
