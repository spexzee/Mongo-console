import useSWR from 'swr'
import { api } from '@/lib/api-client'

export function useDocuments({
  connectionId,
  database,
  collection,
  page = 1,
  pageSize = 25,
  filter = '',
  sort = '',
  projection = '',
}: {
  connectionId?: string | null
  database?: string | null
  collection?: string | null
  page?: number
  pageSize?: number
  filter?: string
  sort?: string
  projection?: string
}) {
  const { data, error, isLoading, mutate } = useSWR(
    connectionId && database && collection
      ? [`/api/db/listDocuments`, connectionId, database, collection, page, pageSize, filter, sort, projection]
      : null,
    () =>
      api.db({
        connectionId: connectionId!,
        database: database!,
        collection: collection!,
        action: 'listDocuments',
        page,
        pageSize,
        filter: filter || undefined,
        sort: sort || undefined,
        projection: projection || undefined,
      })
  )

  return {
    documents: data?.documents || [],
    total: data?.total || 0,
    page: data?.page || page,
    pageSize: data?.pageSize || pageSize,
    isLoading,
    isError: !!error,
    error,
    mutate,
  }
}
