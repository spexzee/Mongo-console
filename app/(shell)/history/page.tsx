'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { History, RefreshCw, Trash2, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function HistoryPage() {
  const { data: history, isLoading, mutate } = useSWR('/api/history', () => api.history.list())

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear query history?')) return
    try {
      await api.history.clear()
      toast.success('History cleared')
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear history')
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
            <span className="text-foreground">Activity</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Query History & Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit trailing of executed operations, shell commands and latencies.
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded-lg border border-border/40 bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : !history || history.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-xl text-muted-foreground text-sm">
          No query history recorded yet.
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[100px] text-xs">Status</TableHead>
                <TableHead className="w-[140px] text-xs">Connection</TableHead>
                <TableHead className="w-[120px] text-xs">Database</TableHead>
                <TableHead className="text-xs font-mono">Command</TableHead>
                <TableHead className="w-[100px] text-xs">Duration</TableHead>
                <TableHead className="w-[150px] text-right text-xs">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item: any, idx: number) => (
                <TableRow key={item.id || item._id || idx} className="text-xs font-mono">
                  <TableCell>
                    {item.ok ? (
                      <span className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> OK
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-3.5 w-3.5" /> Failed
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-sans text-foreground font-medium truncate max-w-[120px]">
                    {item.connectionName}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[100px]">
                    {item.database || '—'}
                  </TableCell>
                  <TableCell className="text-foreground truncate max-w-[300px]">
                    {item.command}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.durationMs}ms
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground font-sans text-[11px]">
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
