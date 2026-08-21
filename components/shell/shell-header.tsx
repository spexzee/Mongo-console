'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Database, Plus, Sparkles } from 'lucide-react'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConnections } from '@/hooks/use-connections'
import type { ConnectionSummary } from '@/lib/types'

export function ShellHeader() {
  const pathname = usePathname()
  const { connections } = useConnections()

  // Get active connection name if on a connection-scoped page
  const activeConn = React.useMemo(() => {
    const segments = pathname.split('/').filter(Boolean)
    if (['explorer', 'query', 'backups', 'indexes', 'schema'].includes(segments[0]) && segments[1]) {
      return connections.find((c: ConnectionSummary) => c.id === segments[1])
    }
    if (segments.length >= 3) {
      return connections.find((c: ConnectionSummary) => c.id === segments[0])
    }
    return null
  }, [pathname, connections])

  // Get readable page title from pathname
  const pageTitle = React.useMemo(() => {
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0 || segments[0] === 'connections') return 'Connections'
    if (segments[0] === 'explorer') return 'Explorer'
    if (segments[0] === 'query') return 'Query Runner'
    if (segments[0] === 'backups') return 'Backups & Restore'
    if (segments[0] === 'transfer') return 'Transfer / Import'
    if (segments[0] === 'history') return 'History & Audit'
    if (segments[0] === 'saved') return 'Saved Queries'
    if (segments[0] === 'indexes') return 'Indexes'
    if (segments[0] === 'schema') return 'Schema'
    return 'Console'
  }, [pathname])

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-background/80 px-3 sm:px-4 backdrop-blur md:hidden">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile Sidebar Opening Trigger Button */}
        <SidebarTrigger className="h-9 w-9 text-foreground hover:bg-accent rounded-lg shrink-0" />

        {/* Brand & Page Info */}
        <Link href="/connections" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-xs">
            M
          </div>
          <span className="font-semibold text-sm tracking-tight text-foreground hidden xs:inline-block">
            Mongo Console
          </span>
        </Link>

        <span className="text-muted-foreground/40 hidden xs:inline-block">/</span>
        <span className="text-xs font-medium text-foreground truncate max-w-[120px] sm:max-w-none">
          {pageTitle}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {activeConn ? (
          <Badge variant="outline" className="text-[11px] gap-1 px-2 py-0.5 max-w-[130px] truncate font-normal">
            <span className={`h-1.5 w-1.5 rounded-full bg-${activeConn.color}-500 shrink-0`} />
            <span className="truncate">{activeConn.name}</span>
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5 gap-1"
            render={<Link href="/connections" />}
          >
            <Database className="h-3 w-3" />
            <span className="hidden sm:inline">Connections</span>
          </Button>
        )}
      </div>
    </header>
  )
}
