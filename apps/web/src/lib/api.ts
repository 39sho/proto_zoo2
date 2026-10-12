import { getAuthToken } from './session'

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080'

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
