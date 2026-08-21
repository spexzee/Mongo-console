'use client'

import React from 'react'
import Link from 'next/link'
import {
  ArrowLeftRight,
  Upload,
  Database,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  TableProperties,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  PlusCircle,
  FolderInput,
  FolderPlus,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useConnections } from '@/hooks/use-connections'
import { useDatabases } from '@/hooks/use-databases'
import { useCollections } from '@/hooks/use-collections'
import type { ConnectionSummary, DatabaseInfo, CollectionInfo } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function TransferImportPage() {
  const { connections } = useConnections()

  // Transfer state
  const [sourceConn, setSourceConn] = React.useState('')
  const [sourceDb, setSourceDb] = React.useState('')
  const [selectedCols, setSelectedCols] = React.useState<string[]>([])

  const [targetConn, setTargetConn] = React.useState('')
  const [targetDb, setTargetDb] = React.useState('')
  const [isCustomTargetDb, setIsCustomTargetDb] = React.useState(false)
  const [customTargetDbName, setCustomTargetDbName] = React.useState('')

  const [mode, setMode] = React.useState<'append' | 'overwrite' | 'upsert'>('append')
  const [isTransferring, setIsTransferring] = React.useState(false)
  const [progressLog, setProgressLog] = React.useState<string[]>([])
  const [currentProgress, setCurrentProgress] = React.useState<{ copied: number; total: number; col: string } | null>(null)

  // Initialize connection defaults
  React.useEffect(() => {
    if (connections.length > 0) {
      if (!sourceConn) setSourceConn(connections[0].id)
      if (!targetConn) setTargetConn(connections[0].id)
    }
  }, [connections, sourceConn, targetConn])

  const { databases: sourceDbs, isLoading: sourceDbsLoading, mutate: mutateSourceDbs } = useDatabases(sourceConn)
  const { collections: sourceCols, isLoading: sourceColsLoading } = useCollections(sourceConn, sourceDb)

  const { databases: targetDbs, isLoading: targetDbsLoading, mutate: mutateTargetDbs } = useDatabases(targetConn)

  // Effective target database name
  const effectiveTargetDb = isCustomTargetDb ? customTargetDbName.trim() : targetDb

  // Toggle collection selection
  const toggleCol = (colName: string) => {
    setSelectedCols((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    )
  }

  // Select all collections
  const toggleSelectAll = () => {
    if (selectedCols.length === sourceCols.length && sourceCols.length > 0) {
      setSelectedCols([])
    } else {
      setSelectedCols(sourceCols.map((c: CollectionInfo) => c.name))
    }
  }

  // Update selectedCols when database changes or collections load
  const prevSourceDbRef = React.useRef(sourceDb)
  const prevColsCountRef = React.useRef(0)

  React.useEffect(() => {
    if (prevSourceDbRef.current !== sourceDb || prevColsCountRef.current !== sourceCols.length) {
      prevSourceDbRef.current = sourceDb
      prevColsCountRef.current = sourceCols.length
      if (sourceCols.length > 0) {
        setSelectedCols(sourceCols.map((c: CollectionInfo) => c.name))
      } else {
        setSelectedCols([])
      }
    }
  }, [sourceDb, sourceCols])

  // Is self-transfer into the same database?
  const isSameDbTransfer = Boolean(
    sourceConn &&
      targetConn &&
      sourceConn === targetConn &&
      sourceDb &&
      effectiveTargetDb &&
      sourceDb === effectiveTargetDb
  )

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sourceConn || !sourceDb || !targetConn || !effectiveTargetDb) {
      toast.error('Please select both source and target connections and databases')
      return
    }
    if (isSameDbTransfer) {
      toast.error('Source and target databases cannot be the same. Please choose a different target database.')
      return
    }
    if (selectedCols.length === 0) {
      toast.error('Please select at least one collection to transfer')
      return
    }

    setIsTransferring(true)
    setProgressLog([])
    setCurrentProgress(null)

    try {
      const response = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceConnectionId: sourceConn,
          sourceDatabase: sourceDb,
          targetConnectionId: targetConn,
          targetDatabase: effectiveTargetDb,
          collections: selectedCols,
          mode,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Transfer failed to start')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) throw new Error('Readable stream not supported')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === 'start') {
              setProgressLog((prev) => [...prev, `🚀 Starting migration: ${event.collections.length} collection(s) → ${effectiveTargetDb}`])
            } else if (event.type === 'collection-start') {
              setCurrentProgress({ copied: 0, total: 100, col: event.collection })
              setProgressLog((prev) => [...prev, `📦 [${event.index}/${event.total}] Copying collection "${event.collection}"...`])
            } else if (event.type === 'progress') {
              setCurrentProgress({ copied: event.copied, total: event.total, col: event.collection })
            } else if (event.type === 'collection-done') {
              setProgressLog((prev) => [
                ...prev,
                `✓ "${event.collection}": ${event.copied} docs transferred${event.skipped ? `, ${event.skipped} skipped` : ''}`,
              ])
            } else if (event.type === 'log') {
              setProgressLog((prev) => [...prev, `⚠️ ${event.message}`])
            } else if (event.type === 'done') {
              setProgressLog((prev) => [
                ...prev,
                `🎉 Transfer completed in ${Math.round(event.durationMs / 1000)}s! Total: ${event.copied} docs transferred into ${effectiveTargetDb}.`,
              ])
              toast.success(`Transfer completed (${event.copied} documents into ${effectiveTargetDb})`)
              mutateTargetDbs()
            } else if (event.type === 'error') {
              setProgressLog((prev) => [...prev, `❌ Error: ${event.message}`])
              toast.error(event.message)
            }
          } catch {
            // Ignore parse errors on partial chunks
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Transfer failed')
      setProgressLog((prev) => [...prev, `❌ Fatal Error: ${err.message}`])
    } finally {
      setIsTransferring(false)
    }
  }

  const allSelected = selectedCols.length === sourceCols.length && sourceCols.length > 0
  const selectedSourceConn = connections.find((c) => c.id === sourceConn)
  const selectedTargetConn = connections.find((c) => c.id === targetConn)

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
            <span className="text-foreground">Data Operations</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" />
            Data Transfer & Import / Export
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Migrate entire databases or selected collections across databases and MongoDB instances.
          </p>
        </div>
      </div>

      <Tabs defaultValue="transfer">
        <TabsList>
          <TabsTrigger value="transfer" className="gap-1.5 text-xs">
            <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer Collections
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" /> File Import
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transfer" className="mt-4 space-y-6">
          <form onSubmit={handleTransfer}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Source Box */}
              <Card className="flex flex-col justify-between shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                      Source Database & Collections
                    </CardTitle>
                    {sourceDb && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {sourceCols.length} collections
                      </Badge>
                    )}
                  </div>
                  <CardDescription>Select the origin cluster and collections to replicate.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Source Connection */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Source Connection</Label>
                    <Select value={sourceConn} onValueChange={(val: string | null) => setSourceConn(val || '')} required>
                      <SelectTrigger className="text-xs">
                        {selectedSourceConn ? (
                          <div className="flex items-center gap-2 truncate">
                            <span className={`h-2 w-2 rounded-full bg-${selectedSourceConn.color}-500 shrink-0`} />
                            <span className="truncate">{selectedSourceConn.name}</span>
                          </div>
                        ) : (
                          <SelectValue placeholder="Select Source Connection" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((c: ConnectionSummary) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full bg-${c.color}-500`} />
                              <span>{c.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Source Database */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Source Database</Label>
                      {sourceConn && (
                        <button
                          type="button"
                          onClick={() => mutateSourceDbs()}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 ${sourceDbsLoading ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                      )}
                    </div>
                    <Select
                      value={sourceDb}
                      onValueChange={(val: string | null) => setSourceDb(val || '')}
                      disabled={!sourceConn || sourceDbsLoading}
                      required
                    >
                      <SelectTrigger className="text-xs font-mono">
                        <SelectValue placeholder={sourceDbsLoading ? "Loading databases..." : "Select Database"} />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceDbs.map((d: DatabaseInfo) => (
                          <SelectItem key={d.name} value={d.name} className="text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <Database className="h-3 w-3 text-muted-foreground" />
                              <span>{d.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Collection Multi-Select with Select All */}
                  {sourceDb && (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Collections to Transfer ({selectedCols.length}/{sourceCols.length})</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={toggleSelectAll}
                          className="h-7 text-xs px-2 gap-1.5"
                        >
                          {allSelected ? (
                            <>
                              <CheckSquare className="h-3.5 w-3.5 text-primary" /> Deselect All
                            </>
                          ) : (
                            <>
                              <Square className="h-3.5 w-3.5" /> Select All ({sourceCols.length})
                            </>
                          )}
                        </Button>
                      </div>

                      {sourceColsLoading ? (
                        <div className="h-28 rounded-lg border border-border/40 bg-card/40 animate-pulse" />
                      ) : sourceCols.length === 0 ? (
                        <div className="p-4 text-center rounded border border-dashed text-xs text-muted-foreground">
                          No collections found in database &quot;{sourceDb}&quot;.
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1 bg-muted/20">
                          {sourceCols.map((col: CollectionInfo) => {
                            const isChecked = selectedCols.includes(col.name)
                            return (
                              <div
                                key={col.name}
                                onClick={() => toggleCol(col.name)}
                                className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors text-xs font-mono ${
                                  isChecked ? 'bg-primary/10 text-foreground font-medium' : 'hover:bg-muted/50 text-muted-foreground'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={() => toggleCol(col.name)}
                                  />
                                  <span className="truncate">{col.name}</span>
                                </div>
                                <span className="text-[11px] opacity-70">
                                  {col.count.toLocaleString()} docs
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 2. Target Box */}
              <Card className="flex flex-col justify-between shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                    Target Destination
                  </CardTitle>
                  <CardDescription>
                    Select destination MongoDB cluster and target database (e.g. school-db-demo).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Target Connection */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Target Connection</Label>
                      {sourceConn === targetConn && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Same Connection
                        </Badge>
                      )}
                    </div>
                    <Select value={targetConn} onValueChange={(val: string | null) => setTargetConn(val || '')} required>
                      <SelectTrigger className="text-xs">
                        {selectedTargetConn ? (
                          <div className="flex items-center gap-2 truncate">
                            <span className={`h-2 w-2 rounded-full bg-${selectedTargetConn.color}-500 shrink-0`} />
                            <span className="truncate">{selectedTargetConn.name}</span>
                          </div>
                        ) : (
                          <SelectValue placeholder="Select Target Connection" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((c: ConnectionSummary) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs" disabled={c.readOnly}>
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full bg-${c.color}-500`} />
                              <span>{c.name}</span>
                              {c.readOnly && <Badge variant="secondary" className="text-[9px] py-0">RO</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target Database Selection with Dropdown / New DB mode */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Target Database</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCustomTargetDb(!isCustomTargetDb)}
                        className="h-6 text-[11px] px-1.5 text-primary hover:text-primary/80 gap-1"
                      >
                        {isCustomTargetDb ? (
                          <>
                            <Database className="h-3 w-3" /> Choose from existing DBs
                          </>
                        ) : (
                          <>
                            <FolderPlus className="h-3 w-3" /> + Create new DB
                          </>
                        )}
                      </Button>
                    </div>

                    {isCustomTargetDb ? (
                      <div className="space-y-1">
                        <Input
                          placeholder="e.g. school-db-demo, staging_db"
                          value={customTargetDbName}
                          onChange={(e) => setCustomTargetDbName(e.target.value)}
                          className="font-mono text-xs"
                          required
                          autoFocus
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Enter the name of the new database to create.
                        </p>
                      </div>
                    ) : (
                      <Select
                        value={targetDb}
                        onValueChange={(val: string | null) => setTargetDb(val || '')}
                        disabled={!targetConn || targetDbsLoading}
                        required
                      >
                        <SelectTrigger className="text-xs font-mono">
                          <SelectValue placeholder={targetDbsLoading ? "Loading databases..." : "Choose Target Database (e.g. school-db-demo)"} />
                        </SelectTrigger>
                        <SelectContent>
                          {targetDbs.map((d: DatabaseInfo) => {
                            const isCurrentSource = sourceConn === targetConn && d.name === sourceDb
                            return (
                              <SelectItem
                                key={d.name}
                                value={d.name}
                                className="text-xs font-mono"
                                disabled={isCurrentSource}
                              >
                                <div className="flex items-center justify-between w-full gap-3">
                                  <div className="flex items-center gap-2">
                                    <Database className="h-3 w-3 text-muted-foreground" />
                                    <span>{d.name}</span>
                                  </div>
                                  {isCurrentSource && (
                                    <span className="text-[10px] text-amber-500 font-sans italic">
                                      (Current source)
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    )}

                    {isSameDbTransfer && (
                      <div className="flex items-center gap-1.5 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Source and target database are identical. Please choose a different target DB (e.g. school-db-demo).</span>
                      </div>
                    )}

                    {!isCustomTargetDb && effectiveTargetDb && !isSameDbTransfer && (
                      <p className="text-[11px] text-muted-foreground">
                        Selected collections will be copied into <strong className="text-foreground font-mono">{effectiveTargetDb}</strong>.
                      </p>
                    )}
                  </div>

                  {/* Transfer Mode */}
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                    <Label className="text-xs font-semibold">Transfer Mode</Label>
                    <Select value={mode} onValueChange={(v: 'append' | 'overwrite' | 'upsert' | null) => setMode(v || 'append')}>
                      <SelectTrigger className="text-xs bg-background w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="append">
                          Append (keep existing documents, skip duplicates)
                        </SelectItem>
                        <SelectItem value="upsert">
                          Upsert (replace matching _id, insert new documents)
                        </SelectItem>
                        <SelectItem value="overwrite">
                          Overwrite (clear target collection first)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Action Bar */}
            <Card className="mt-6 shadow-sm border-primary/20">
              <CardFooter className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-muted-foreground">
                  {selectedCols.length > 0 && effectiveTargetDb && !isSameDbTransfer ? (
                    <span>
                      Ready to transfer <strong className="text-foreground">{selectedCols.length}</strong> collection(s) from <code className="text-primary font-mono">{sourceDb}</code> into <code className="text-emerald-500 font-bold font-mono">{effectiveTargetDb}</code>
                    </span>
                  ) : isSameDbTransfer ? (
                    <span className="text-destructive">Please select a different target database.</span>
                  ) : (
                    <span>Select collections from the source database and choose a target database to proceed.</span>
                  )}
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={isTransferring || selectedCols.length === 0 || !effectiveTargetDb.trim() || isSameDbTransfer}
                  className="gap-2 px-6"
                >
                  <ArrowRight className={`h-4 w-4 ${isTransferring ? 'animate-pulse' : ''}`} />
                  {isTransferring ? 'Replicating Data...' : `Start Transfer (${selectedCols.length} collections)`}
                </Button>
              </CardFooter>
            </Card>
          </form>

          {/* Live Progress Log Terminal */}
          {(isTransferring || progressLog.length > 0) && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live Migration Console
                  </CardTitle>
                  {currentProgress && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {currentProgress.col}: {currentProgress.copied}/{currentProgress.total} docs
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 font-mono text-xs bg-muted/20 space-y-1 max-h-60 overflow-y-auto">
                {progressLog.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload JSON / CSV file</CardTitle>
              <CardDescription>
                Import array of JSON documents or CSV rows directly into any selected collection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-xl p-8 text-center space-y-2">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground opacity-50" />
                <p className="text-xs text-muted-foreground">Select a .json, .jsonl or .csv file</p>
                <Input type="file" accept=".json,.jsonl,.csv" className="max-w-xs mx-auto text-xs" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
