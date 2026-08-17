'use client'

import React from 'react'
import { Edit2, Trash2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

function formatCellValue(val: unknown): { display: string; type: 'date' | 'oid' | 'null' | 'bool' | 'text' | 'object' } {
  if (val === null || val === undefined) {
    return { display: 'null', type: 'null' }
  }

  if (typeof val === 'boolean') {
    return { display: val ? 'true' : 'false', type: 'bool' }
  }

  if (typeof val === 'object') {
    // EJSON Date: { $date: "2026-04-23T..." } or { $date: { $numberLong: "..." } }
    if ('$date' in (val as Record<string, unknown>)) {
      const dateVal = (val as { $date: string | number | { $numberLong: string } }).$date
      const dateStr =
        typeof dateVal === 'object' && dateVal && '$numberLong' in dateVal
          ? Number(dateVal.$numberLong)
          : (dateVal as string | number)
      const d = new Date(dateStr)
      if (!isNaN(d.getTime())) {
        return {
          display: d.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          }),
          type: 'date',
        }
      }
    }

    // EJSON ObjectId: { $oid: "..." }
    if ('$oid' in (val as Record<string, unknown>)) {
      return { display: String((val as { $oid: string }).$oid), type: 'oid' }
    }

    // EJSON Decimal / Long / Int
    if ('$numberDecimal' in (val as Record<string, unknown>)) {
      return { display: String((val as { $numberDecimal: string }).$numberDecimal), type: 'text' }
    }
    if ('$numberLong' in (val as Record<string, unknown>)) {
      return { display: String((val as { $numberLong: string }).$numberLong), type: 'text' }
    }

    return { display: JSON.stringify(val), type: 'object' }
  }

  // If plain ISO Date string
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      return {
        display: d.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
        type: 'date',
      }
    }
  }

  return { display: String(val), type: 'text' }
}

export function DocumentTable({
  documents,
  viewMode,
  isLoading,
  onEdit,
  onDelete,
}: {
  documents: any[]
  viewMode: 'table' | 'json'
  isLoading: boolean
  onEdit: (doc: any) => void
  onDelete: (doc: any) => void
}) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 w-full rounded border border-border/40 bg-card/40 animate-pulse" />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-card/20 space-y-2">
        <p className="font-semibold text-sm">No documents match the current filter</p>
        <p className="text-xs text-muted-foreground">Try clearing or adjusting your query.</p>
      </div>
    )
  }

  if (viewMode === 'json') {
    return (
      <div className="space-y-3">
        {documents.map((doc, idx) => {
          const rawId = doc._id?.$oid || doc._id || `doc-${idx}`
          const jsonString = JSON.stringify(doc, null, 2)
          return (
            <div
              key={rawId}
              className="relative group rounded-lg border border-border/50 bg-card p-4 font-mono text-xs overflow-x-auto shadow-sm"
            >
              <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => copyToClipboard(jsonString, rawId)}
                >
                  {copiedId === rawId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(doc)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onDelete(doc)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <pre className="text-muted-foreground whitespace-pre-wrap">{jsonString}</pre>
            </div>
          )
        })}
      </div>
    )
  }

  // Derive column headers dynamically
  const keysSet = new Set<string>()
  documents.forEach((d) => {
    Object.keys(d).forEach((k) => keysSet.add(k))
  })
  const columns = Array.from(keysSet).slice(0, 8) // Show top 8 columns

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-[120px] text-xs font-mono">_id</TableHead>
            {columns
              .filter((c) => c !== '_id')
              .map((c) => (
                <TableHead key={c} className="text-xs font-mono font-medium text-foreground">
                  {c}
                </TableHead>
              ))}
            <TableHead className="w-[80px] text-right text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc, idx) => {
            const rawId = doc._id?.$oid || doc._id || `doc-${idx}`
            return (
              <TableRow key={rawId} className="hover:bg-muted/30 font-mono text-xs">
                <TableCell className="font-semibold text-primary truncate max-w-[130px]" title={String(rawId)}>
                  {String(rawId)}
                </TableCell>

                {columns
                  .filter((c) => c !== '_id')
                  .map((c) => {
                    const val = doc[c]
                    const { display, type } = formatCellValue(val)
                    return (
                      <TableCell
                        key={c}
                        className={`truncate max-w-[200px] ${
                          type === 'date'
                            ? 'text-sky-400 font-sans text-[11px] font-medium'
                            : type === 'null'
                            ? 'text-muted-foreground/50 italic'
                            : type === 'bool'
                            ? 'text-amber-500 font-semibold'
                            : 'text-muted-foreground'
                        }`}
                        title={display}
                      >
                        {display}
                      </TableCell>
                    )
                  })}

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEdit(doc)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDelete(doc)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
