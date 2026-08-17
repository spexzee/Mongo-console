'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  TableProperties,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ArrowUpDown,
  Code,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  Edit2,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Key
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useDocuments } from '@/hooks/use-documents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DocumentTable } from '@/components/documents/document-table'
import { DocumentEditorDialog } from '@/components/documents/document-editor'

export default function DocumentBrowserPage() {
  const params = useParams()
  const connId = params.connId as string
  const dbName = params.db as string
  const colName = params.col as string

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [filter, setFilter] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState('')
  const [sort, setSort] = React.useState('')
  const [activeSort, setActiveSort] = React.useState('')
  const [viewMode, setViewMode] = React.useState<'table' | 'json'>('table')

  const [editorOpen, setEditorOpen] = React.useState(false)
  const [selectedDoc, setSelectedDoc] = React.useState<any>(null)

  const { documents, total, isLoading, mutate } = useDocuments({
    connectionId: connId,
    database: dbName,
    collection: colName,
    page,
    pageSize,
    filter: activeFilter,
    sort: activeSort,
  })

  const totalPages = Math.ceil(total / pageSize) || 1

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveFilter(filter)
    setActiveSort(sort)
    setPage(1)
  }

  const handleResetFilter = () => {
    setFilter('')
    setSort('')
    setActiveFilter('')
    setActiveSort('')
    setPage(1)
  }

  const handleDelete = async (doc: any) => {
    const id = doc._id?.$oid || doc._id
    if (!id) {
      toast.error('Cannot identify document _id')
      return
    }
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      await api.db({
        connectionId: connId,
        database: dbName,
        collection: colName,
        action: 'deleteDocuments',
        ids: [id],
      })
      toast.success('Document deleted')
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete document')
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 p-4 md:px-6 shrink-0 bg-card/40 backdrop-blur">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href={`/explorer/${connId}`} className="hover:text-foreground">
              Databases
            </Link>
            <span>/</span>
            <Link href={`/explorer/${connId}/${dbName}`} className="hover:text-foreground font-mono">
              {dbName}
            </Link>
            <span>/</span>
            <span className="text-foreground font-mono">{colName}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight font-mono flex items-center gap-2">
              <TableProperties className="h-5 w-5 text-primary" />
              {colName}
            </h1>
            <Badge variant="secondary" className="text-xs font-mono">
              {total.toLocaleString()} documents
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            render={<Link href={`/indexes/${connId}/${dbName}/${colName}`} />}
          >
            <Key className="h-3.5 w-3.5 mr-1" /> Indexes
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            render={<Link href={`/schema/${connId}/${dbName}/${colName}`} />}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Schema
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelectedDoc(null)
              setEditorOpen(true)
            }}
            className="text-xs h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Insert Document
          </Button>
        </div>
      </div>

      {/* Filter / Sort Toolbar */}
      <form
        onSubmit={handleApplyFilter}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 px-4 md:px-6 bg-muted/20 border-b border-border/40 shrink-0 text-xs"
      >
        <div className="flex-1 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            placeholder='Filter: { status: "active", age: { $gte: 18 } }'
            value={filter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
            className="h-8 font-mono text-xs"
          />
        </div>

        <div className="w-full sm:w-48 flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            placeholder='Sort: { createdAt: -1 }'
            value={sort}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSort(e.target.value)}
            className="h-8 font-mono text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" className="h-8 text-xs">
            Apply
          </Button>
          {(activeFilter || activeSort) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetFilter}
              className="h-8 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          )}

          <div className="border-l border-border pl-2 flex items-center gap-1">
            <Tabs value={viewMode} onValueChange={(v: 'table' | 'json') => setViewMode(v)}>
              <TabsList className="h-8 p-0.5">
                <TabsTrigger value="table" className="h-7 text-xs px-2.5">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="json" className="h-7 text-xs px-2.5">
                  <Code className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </form>

      {/* Main Documents Table / JSON Area */}
      <div className="flex-1 overflow-auto p-4 md:px-6">
        <DocumentTable
          documents={documents}
          viewMode={viewMode}
          isLoading={isLoading}
          onEdit={(doc: any) => {
            setSelectedDoc(doc)
            setEditorOpen(true)
          }}
          onDelete={handleDelete}
        />
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between border-t border-border/40 p-3 px-4 md:px-6 bg-card shrink-0 text-xs">
        <div className="text-muted-foreground font-mono">
          Page {page} of {totalPages} ({total} total)
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p: number) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="h-8 px-2.5"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="h-8 px-2.5"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Insert / Edit Dialog */}
      <DocumentEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        document={selectedDoc}
        connId={connId}
        dbName={dbName}
        colName={colName}
        onSuccess={() => {
          setEditorOpen(false)
          mutate()
        }}
      />
    </div>
  )
}
