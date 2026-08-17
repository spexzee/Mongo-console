'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Bookmark, RefreshCw, Trash2, Terminal, Play } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function SavedQueriesPage() {
  const { data: savedQueries, isLoading, mutate } = useSWR(
    '/api/saved-queries',
    () => api.savedQueries.list()
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this saved query?')) return
    try {
      await api.savedQueries.delete(id)
      toast.success('Saved query deleted')
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete query')
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
            <Bookmark className="h-6 w-6 text-primary" />
            Saved Queries
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bookmarked MongoDB shell expressions and aggregation pipelines.
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
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-border/40 bg-card/40 animate-pulse p-4" />
          ))}
        </div>
      ) : !savedQueries || savedQueries.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-xl text-muted-foreground text-sm">
          No saved queries yet. You can bookmark queries directly from the Query Runner!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {savedQueries.map((item: any) => (
            <Card key={item._id} className="flex flex-col justify-between">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  {item.database && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {item.database}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <pre className="p-2.5 rounded bg-muted/40 font-mono text-xs text-muted-foreground truncate whitespace-pre-wrap max-h-24 overflow-hidden">
                  {item.command}
                </pre>
              </CardContent>
              <CardFooter className="pt-2 border-t border-border/40 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item._id)}
                  className="text-xs text-destructive hover:text-destructive h-8 px-2"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>

                {item.connectionId ? (
                  <Button
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                    render={<Link href={`/query/${item.connectionId}`} />}
                  >
                    <Play className="h-3 w-3" /> Run Query
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
