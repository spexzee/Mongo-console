import useSWR from 'swr'
import { api } from '@/lib/api-client'
import type { ConnectionSummary } from '@/lib/types'

export function useConnections() {
  const { data, error, isLoading, mutate } = useSWR<ConnectionSummary[]>(
    '/api/connections',
    () => api.connections.list()
  )

  return {
    connections: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  }
}
