'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { Key, Plus, Trash2, RefreshCw, Layers, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
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
import { Switch } from '@/components/ui/switch'

export default function IndexManagerPage() {
  const params = useParams()
  const connId = params.connId as string
  const dbName = params.db as string
  const colName = params.col as string

  const { data: indexes, isLoading, mutate } = useSWR(
    [`/api/db/listIndexes`, connId, dbName, colName],
    () =>
      api.db({
        connectionId: connId,
        database: dbName,
        collection: colName,
        action: 'listIndexes',
      })
  )

  const [createOpen, setCreateOpen] = React.useState(false)
  const [keys, setKeys] = React.useState('{\n  "createdAt": -1\n}')
  const [unique, setUnique] = React.useState(false)
  const [sparse, setSparse] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await api.db({
        connectionId: connId,
        database: dbName,
        collection: colName,
        action: 'createIndex',
        keys,
        options: { unique, sparse },
      })
      toast.success('Index created successfully')
      setCreateOpen(false)
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create index')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDrop = async (indexName: string) => {
    if (indexName === '_id_') {
      toast.error('The default _id_ index cannot be dropped')
      return
    }
    if (!confirm(`Are you sure you want to drop index "${indexName}"?`)) return
    try {
      await api.db({
        connectionId: connId,
        database: dbName,
        collection: colName,
        action: 'dropIndex',
        name: indexName,
      })
      toast.success(`Index "${indexName}" dropped`)
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to drop index')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href={`/${connId}/${dbName}/${colName}`} className="hover:text-foreground font-mono">
              {colName}
            </Link>
            <span>/</span>
            <span className="text-foreground">Indexes</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 font-mono">
            <Key className="h-6 w-6 text-primary" />
            Index Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Optimize query performance and enforce uniqueness on <span className="font-mono">{dbName}.{colName}</span>.
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
            Create Index
          </Button>
        </div>
      </div>

      {/* Index List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border/40 bg-card/40 animate-pulse p-4" />
          ))}
        </div>
      ) : !indexes || indexes.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-xl text-muted-foreground text-sm">
          No indexes found on this collection.
        </div>
      ) : (
        <div className="grid gap-4">
          {indexes.map((idx: any) => (
            <Card key={idx.name} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sm">{idx.name}</span>
                  {idx.unique && (
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                      Unique
                    </Badge>
                  )}
                  {idx.sparse && (
                    <Badge variant="outline" className="text-[10px]">
                      Sparse
                    </Badge>
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  Keys: {JSON.stringify(idx.key)}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {idx.accesses && (
                  <div className="text-xs text-muted-foreground font-mono">
                    Ops: {idx.accesses.ops || 0}
                  </div>
                )}
                {idx.name !== '_id_' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDrop(idx.name)}
                    className="text-xs text-destructive hover:text-destructive h-8 px-2"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Drop
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Index Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create New Index</DialogTitle>
              <DialogDescription>
                Define index keys JSON object (e.g. 1 for ascending, -1 for descending).
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="keys">Index Keys JSON</Label>
                <Input
                  id="keys"
                  value={keys}
                  onChange={(e) => setKeys(e.target.value)}
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="flex items-center justify-between rounded border p-2.5">
                <Label className="text-xs">Unique</Label>
                <Switch checked={unique} onCheckedChange={setUnique} />
              </div>

              <div className="flex items-center justify-between rounded border p-2.5">
                <Label className="text-xs">Sparse</Label>
                <Switch checked={sparse} onCheckedChange={setSparse} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Index'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
