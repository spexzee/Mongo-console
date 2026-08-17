import useSWR from 'swr'
import { api } from '@/lib/api-client'
import type { CollectionInfo } from '@/lib/types'

export function useCollections(connectionId?: string | null, database?: string | null) {
  const { data, error, isLoading, mutate } = useSWR<CollectionInfo[]>(
    connectionId && database ? [`/api/db/listCollections`, connectionId, database] : null,
    () => api.db({ connectionId: connectionId!, database: database!, action: 'listCollections' })
  )

  return {
    collections: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  }
}
