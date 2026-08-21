'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'
import type { UserSummary } from '@/lib/types'

export function useAuth() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR<{ user: UserSummary }>(
    '/api/auth/me',
    () => api.auth.me(),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )

  const user = data?.user || null
  const isAuthenticated = !!user

  const login = async (credentials: { email: string; password: string }) => {
    const result = await api.auth.login(credentials)
    await mutate({ user: result.user as UserSummary }, false)
    router.push('/connections')
    router.refresh()
    return result
  }

  const register = async (userData: { name: string; email: string; password: string }) => {
    const result = await api.auth.register(userData)
    await mutate({ user: result.user as UserSummary }, false)
    router.push('/connections')
    router.refresh()
    return result
  }

  const logout = async () => {
    try {
      await api.auth.logout()
    } catch {
      // Best-effort logout
    }
    await mutate(undefined, false)
    router.push('/login')
    router.refresh()
  }

  return {
    user,
    isLoading,
    isError: !!error,
    isAuthenticated,
    login,
    register,
    logout,
    mutate,
  }
}
