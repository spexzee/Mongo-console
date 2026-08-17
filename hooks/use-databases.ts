import useSWR from 'swr'
import { api } from '@/lib/api-client'
import type { DatabaseInfo } from '@/lib/types'

export function useDatabases(connectionId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR<DatabaseInfo[]>(
    connectionId ? [`/api/db/listDatabases`, connectionId] : null,
    () => api.db({ connectionId: connectionId!, action: 'listDatabases' })
  )

  return {
    databases: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  }
}
