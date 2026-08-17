export async function fetchJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const data = await res.json()
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || res.statusText || 'An error occurred')
  }
  return data.data !== undefined ? data.data : data
}

export const api = {
  connections: {
    list: () => fetchJson('/api/connections'),
    create: (data: any) => fetchJson('/api/connections', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => fetchJson(`/api/connections/${id}`),
    update: (id: string, data: any) => fetchJson(`/api/connections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => fetchJson(`/api/connections/${id}`, { method: 'DELETE' }),
    test: (uri: string) => fetchJson('/api/connections/test', { method: 'POST', body: JSON.stringify({ uri }) }),
  },
  db: (payload: { connectionId: string; action: string; [key: string]: any }) =>
    fetchJson('/api/db', { method: 'POST', body: JSON.stringify(payload) }),
  query: (payload: { connectionId: string; command: string; database?: string; collection?: string }) =>
    fetchJson('/api/query', { method: 'POST', body: JSON.stringify(payload) }),
  history: {
    list: (connectionId?: string) => fetchJson(`/api/history${connectionId ? `?connectionId=${connectionId}` : ''}`),
    clear: () => fetchJson('/api/history', { method: 'DELETE' }),
  },
  savedQueries: {
    list: (connectionId?: string) => fetchJson(`/api/saved-queries${connectionId ? `?connectionId=${connectionId}` : ''}`),
    create: (data: any) => fetchJson('/api/saved-queries', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => fetchJson(`/api/saved-queries/${id}`, { method: 'DELETE' }),
  },
  backups: {
    list: (connectionId?: string) => fetchJson(`/api/backups${connectionId ? `?connectionId=${connectionId}` : ''}`),
    create: (data: any) => fetchJson('/api/backups', { method: 'POST', body: JSON.stringify(data) }),
    restore: (id: string, data?: any) => fetchJson(`/api/backups/${id}/restore`, { method: 'POST', body: JSON.stringify(data || {}) }),
    delete: (id: string) => fetchJson(`/api/backups/${id}`, { method: 'DELETE' }),
    schedules: {
      list: (connectionId?: string) => fetchJson(`/api/backups/schedules${connectionId ? `?connectionId=${connectionId}` : ''}`),
      create: (data: any) => fetchJson('/api/backups/schedules', { method: 'POST', body: JSON.stringify(data) }),
      delete: (id: string) => fetchJson(`/api/backups/schedules/${id}`, { method: 'DELETE' }),
    },
  },
  transfer: (data: any) => fetchJson('/api/transfer', { method: 'POST', body: JSON.stringify(data) }),
  import: (data: any) => fetchJson('/api/import', { method: 'POST', body: JSON.stringify(data) }),
}
