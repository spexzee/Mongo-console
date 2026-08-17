'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Editor from '@monaco-editor/react'
import { Play, Bookmark, Clock, Check, RefreshCw, Terminal, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useDatabases } from '@/hooks/use-databases'
import type { DatabaseInfo } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

export default function QueryRunnerPage() {
  const params = useParams()
  const connId = params.connId as string
  const { databases } = useDatabases(connId)

  const [selectedDb, setSelectedDb] = React.useState<string>('')
  const [query, setQuery] = React.useState('db.users.find({}).limit(50)')
  const [isRunning, setIsRunning] = React.useState(false)
  const [result, setResult] = React.useState<any>(null)
  const [executionTime, setExecutionTime] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (databases.length > 0 && !selectedDb) {
      setSelectedDb(databases[0].name)
    }
  }, [databases, selectedDb])

  const handleRun = async () => {
    if (!query.trim()) return
    setIsRunning(true)
    const start = performance.now()
    try {
      const res = await api.query({
        connectionId: connId,
        database: selectedDb || undefined,
        command: query.trim(),
      })
      setResult(res)
      setExecutionTime(Math.round(performance.now() - start))
      toast.success('Query executed successfully')
    } catch (err: any) {
      toast.error(err.message || 'Execution failed')
      setResult({ error: err.message || 'An error occurred' })
      setExecutionTime(null)
    } finally {
      setIsRunning(false)
    }
  }

  const handleSave = async () => {
    const name = prompt('Enter a name for this saved query:')
    if (!name?.trim()) return
    try {
      await api.savedQueries.create({
        name: name.trim(),
        connectionId: connId,
        database: selectedDb,
        command: query.trim(),
      })
      toast.success('Query saved!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save query')
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 p-4 md:px-6 shrink-0">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/connections" className="hover:text-foreground">
              Connections
            </Link>
            <span>/</span>
            <span className="text-foreground">Query Runner</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            MongoDB Shell Query Runner
          </h1>
        </div>

        {/* Database context selector & Actions */}
        <div className="flex items-center gap-3">
          <div className="w-48">
            <Select value={selectedDb} onValueChange={(val: string | null) => setSelectedDb(val || '')}>
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue placeholder="Select Database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db: DatabaseInfo) => (
                  <SelectItem key={db.name} value={db.name} className="text-xs font-mono">
                    {db.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            className="text-xs h-8 gap-1.5"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Save Query
          </Button>

          <Button
            size="sm"
            onClick={handleRun}
            disabled={isRunning || !query.trim()}
            className="text-xs h-8 gap-1.5"
          >
            <Play className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            Run Command
          </Button>
        </div>
      </div>

      {/* Editor + Results Split Pane */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-border/40 min-h-[250px]">
          <div className="bg-muted/30 px-4 py-2 border-b border-border/40 flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>Query Editor (mongo shell syntax)</span>
            <span>db.&lt;collection&gt;.find() / aggregate() / runCommand()</span>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="javascript"
              theme="vs-dark"
              value={query}
              onChange={(v: string | undefined) => setQuery(v || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        </div>

        {/* Results Panel */}
        <div className="flex-1 flex flex-col bg-card/60 overflow-hidden min-h-[250px]">
          <div className="bg-muted/30 px-4 py-2 border-b border-border/40 flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">Execution Results</span>
            {executionTime !== null && (
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                <Clock className="h-3 w-3" />
                <span>{executionTime}ms</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4 font-mono text-xs">
            {result ? (
              <pre className="text-muted-foreground whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-2">
                <Terminal className="h-8 w-8 opacity-40" />
                <p>Run a command to see JSON results, aggregates or execution output.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
