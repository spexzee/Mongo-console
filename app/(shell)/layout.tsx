import React, { Suspense } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/shell/app-sidebar'
import { ShellHeader } from '@/components/shell/shell-header'

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Suspense fallback={<div className="w-64 border-r border-border bg-sidebar" />}>
          <AppSidebar />
        </Suspense>
        <SidebarInset className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ShellHeader />
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
