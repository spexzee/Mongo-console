'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Database,
  Terminal,
  FolderTree,
  Archive,
  ArrowLeftRight,
  History,
  Bookmark,
  ChevronRight,
  ChevronDown,
  Layers,
  TableProperties,
  Plus,
  ExternalLink,
  LogOut,
  User,
  Shield,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useConnections } from '@/hooks/use-connections'
import { useDatabases } from '@/hooks/use-databases'
import { useCollections } from '@/hooks/use-collections'
import type { ConnectionSummary, DatabaseInfo, CollectionInfo } from '@/lib/types'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function AppSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const connParam = searchParams.get('conn')
  
  const { connections } = useConnections()

  // Match active connection from URL route if present (/explorer/[connId] or /[connId]/[db]/[col])
  const routeConnId = React.useMemo(() => {
    const segments = pathname.split('/').filter(Boolean)
    if (segments[0] === 'explorer' && segments[1]) return segments[1]
    if (segments[0] === 'query' && segments[1]) return segments[1]
    if (segments[0] === 'backups' && segments[1]) return segments[1]
    if (segments[0] === 'indexes' && segments[1]) return segments[1]
    if (segments[0] === 'schema' && segments[1]) return segments[1]
    if (segments.length >= 3 && connections.some((c: ConnectionSummary) => c.id === segments[0])) {
      return segments[0]
    }
    return null
  }, [pathname, connections])

  const { user, logout } = useAuth()
  const currentConn =
    connections.find((c: ConnectionSummary) => c.id === (routeConnId || connParam)) ||
    connections[0]
  const currentConnId = currentConn?.id

  const { databases, isLoading: isDbsLoading } = useDatabases(currentConnId)
  const [openDbs, setOpenDbs] = React.useState<Record<string, boolean>>({})

  // Auto-open active DB in tree if in /[connId]/[db]/[col] route
  React.useEffect(() => {
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length >= 2) {
      const activeDb = segments[0] === 'explorer' ? segments[2] : segments[1]
      if (activeDb) {
        setOpenDbs((prev) => ({ ...prev, [activeDb]: true }))
      }
    }
  }, [pathname])

  const toggleDb = (dbName: string) => {
    setOpenDbs((prev) => ({ ...prev, [dbName]: !prev[dbName] }))
  }

  const selectConnection = (id: string) => {
    router.push(`/explorer/${id}`)
  }

  const userInitial = (user?.name || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <Sidebar className="border-r border-border bg-sidebar/70 backdrop-blur">
      <SidebarHeader className="p-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-2 mb-2">
          <Link href="/connections" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-xs">
              M
            </div>
            <div className="font-semibold text-sm tracking-tight text-sidebar-foreground">
              Mongo Console
            </div>
          </Link>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase font-mono tracking-wider">
            v1.0
          </Badge>
        </div>

        {/* Connection Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-left font-normal bg-card/60 hover:bg-accent border-border/60 shadow-2xs"
              />
            }
          >
            <div className="flex items-center gap-2 truncate">
              <span
                className={`h-2 w-2 rounded-full ${
                  currentConn?.color ? `bg-${currentConn.color}-500` : 'bg-primary'
                }`}
              />
              <span className="truncate text-xs font-medium">
                {currentConn?.name || 'Select Connection'}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs">Connection Profiles</DropdownMenuLabel>
            {connections.map((c: ConnectionSummary) => (
              <DropdownMenuItem
                key={c.id}
                onClick={() => selectConnection(c.id)}
                className="flex items-center justify-between text-xs cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className={`h-2 w-2 rounded-full bg-${c.color}-500`} />
                  <span className="truncate">{c.name}</span>
                </div>
                {c.readOnly && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">
                    RO
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href="/connections" className="flex items-center gap-2 text-xs" />
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Manage All Profiles
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Core Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith('/explorer') || (pathname.split('/').filter(Boolean).length >= 3 && !pathname.startsWith('/query') && !pathname.startsWith('/indexes') && !pathname.startsWith('/schema') && !pathname.startsWith('/backups'))}
                  render={
                    <Link href={currentConnId ? `/explorer/${currentConnId}` : '/connections'} />
                  }
                >
                  <FolderTree className="h-4 w-4" />
                  <span>Explorer</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith('/query')}
                  render={
                    <Link href={currentConnId ? `/query/${currentConnId}` : '/connections'} />
                  }
                >
                  <Terminal className="h-4 w-4" />
                  <span>Query Runner</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith('/backups')}
                  render={
                    <Link href={currentConnId ? `/backups/${currentConnId}` : '/connections'} />
                  }
                >
                  <Archive className="h-4 w-4" />
                  <span>Backups & Restore</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith('/transfer')}
                  render={<Link href="/transfer" />}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>Transfer / Import</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Database Tree */}
        {currentConnId && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase flex justify-between items-center">
              <span>Databases</span>
              <Link href={`/explorer/${currentConnId}`} className="hover:text-foreground">
                <Layers className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
              </Link>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isDbsLoading ? (
                  <div className="space-y-1.5 px-3 py-2">
                    <div className="h-5 w-3/4 rounded bg-muted/40 animate-pulse" />
                    <div className="h-5 w-1/2 rounded bg-muted/40 animate-pulse" />
                  </div>
                ) : (
                  databases.map((db: DatabaseInfo) => (
                    <DbTreeItem
                      key={db.name}
                      connId={currentConnId}
                      dbName={db.name}
                      isOpen={!!openDbs[db.name]}
                      onToggle={() => toggleDb(db.name)}
                    />
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* History / Logs */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
            Activity
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === '/history'}
                  render={<Link href="/history" />}
                >
                  <History className="h-4 w-4" />
                  <span>History & Audit</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === '/saved'}
                  render={<Link href="/saved" />}
                >
                  <Bookmark className="h-4 w-4" />
                  <span>Saved Queries</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/50 text-xs text-muted-foreground space-y-2">
        {/* User Profile Card / Menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start p-1.5 h-auto hover:bg-accent/80 rounded-lg border border-border/40 bg-card/40 text-left"
                />
              }
            >
              <div className="flex items-center gap-2.5 w-full min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-xs shadow-xs">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="font-medium text-xs text-foreground truncate">
                    {user.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {user.email}
                  </div>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal">
                <div className="font-medium text-foreground">{user.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link href="/connections" className="flex items-center gap-2 text-xs" />
                }
              >
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                My Private Profiles
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="flex items-center gap-2 text-xs text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono">Connected</span>
          </div>
          <Link
            href="https://www.mongodb.com/docs/"
            target="_blank"
            className="hover:text-foreground flex items-center gap-1 text-[11px]"
          >
            Docs <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function DbTreeItem({
  connId,
  dbName,
  isOpen,
  onToggle,
}: {
  connId: string
  dbName: string
  isOpen: boolean
  onToggle: () => void
}) {
  const { collections, isLoading } = useCollections(connId, isOpen ? dbName : null)
  const pathname = usePathname()

  return (
    <SidebarMenuItem>
      <div className="flex items-center w-full">
        <SidebarMenuButton
          onClick={onToggle}
          className="flex-1 justify-between font-mono text-xs"
        >
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{dbName}</span>
          </div>
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </SidebarMenuButton>
      </div>

      {isOpen && (
        <SidebarMenuSub>
          {isLoading ? (
            <div className="space-y-1 py-1 px-3">
              <div className="h-4 w-20 rounded bg-muted/40 animate-pulse" />
            </div>
          ) : (
            collections.map((col: CollectionInfo) => {
              const path = `/${connId}/${dbName}/${col.name}`
              const isActive = pathname === path
              return (
                <SidebarMenuSubItem key={col.name}>
                  <SidebarMenuSubButton
                    isActive={isActive}
                    render={<Link href={path} className="flex items-center gap-2 text-xs font-mono" />}
                  >
                    <TableProperties className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{col.name}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })
          )}
          {!isLoading && collections.length === 0 && (
            <div className="px-4 py-1 text-[11px] text-muted-foreground italic font-sans">
              No collections
            </div>
          )}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}
