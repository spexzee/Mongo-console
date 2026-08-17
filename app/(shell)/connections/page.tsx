'use client'

import React from 'react'
import { Plus, Database, Activity, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react'
import { useConnections } from '@/hooks/use-connections'
import { Button } from '@/components/ui/button'
import { ConnectionCard } from '@/components/connections/connection-card'
import { ConnectionFormDialog } from '@/components/connections/connection-form'

export default function ConnectionsPage() {
  const { connections, isLoading, mutate } = useConnections()
  const [openNew, setOpenNew] = React.useState(false)

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connection Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure, manage and securely connect to your MongoDB clusters and instances.
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
          <Button size="sm" onClick={() => setOpenNew(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Connection
          </Button>
        </div>
      </div>

      {/* Grid of Connections */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-border/40 bg-card/40 animate-pulse p-4"
            />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card/20 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Database className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">No connections configured</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Add your first MongoDB connection URI to start managing databases, collections, documents and backups.
            </p>
          </div>
          <Button onClick={() => setOpenNew(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Connection Profile
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connections.map((conn) => (
            <ConnectionCard key={conn.id} connection={conn} onUpdate={() => mutate()} />
          ))}
        </div>
      )}

      {/* New Connection Dialog */}
      <ConnectionFormDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onSuccess={() => {
          mutate()
          setOpenNew(false)
        }}
      />
    </div>
  )
}
