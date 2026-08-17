'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { Sparkles, RefreshCw, Layers, PieChart as PieIcon, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'

export default function SchemaAnalyzerPage() {
  const params = useParams()
  const connId = params.connId as string
  const dbName = params.db as string
  const colName = params.col as string

  const { data, isLoading, mutate } = useSWR(
    [`/api/db/analyzeSchema`, connId, dbName, colName],
    () =>
      api.db({
        connectionId: connId,
        database: dbName,
        collection: colName,
        action: 'analyzeSchema',
        sampleSize: 400,
      })
  )

  const fields = data?.fields || []
  const sampled = data?.sampled || 0

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
            <span className="text-foreground">Schema</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 font-mono">
            <Sparkles className="h-6 w-6 text-primary" />
            Schema Analysis
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Derive types, field coverage and polymorphism across sample documents in <span className="font-mono">{colName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {sampled} Sampled Docs
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Re-analyze
          </Button>
        </div>
      </div>

      {/* Fields Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-border/40 bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : fields.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-xl text-muted-foreground text-sm">
          No documents available in this collection to analyze.
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[220px] text-xs font-mono">Field Path</TableHead>
                <TableHead className="w-[180px] text-xs">Data Types</TableHead>
                <TableHead className="w-[200px] text-xs">Coverage</TableHead>
                <TableHead className="text-xs">Sample Values</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field: any) => {
                const coveragePercent = Math.round((field.coverage || 0) * 100)
                return (
                  <TableRow key={field.path} className="text-xs">
                    <TableCell className="font-mono font-semibold text-foreground">
                      {field.path}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {field.types.map((t: any) => (
                          <Badge key={t.type} variant="secondary" className="font-mono text-[10px]">
                            {t.type} ({t.count})
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
                          <span>{coveragePercent}%</span>
                          <span>{field.presentIn}/{sampled}</span>
                        </div>
                        <Progress value={coveragePercent} className="h-1.5" />
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-muted-foreground truncate max-w-[250px]">
                      {field.samples?.join(', ') || '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
