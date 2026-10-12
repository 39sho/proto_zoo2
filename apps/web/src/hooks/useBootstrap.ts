import { useEffect, useState } from 'react'

import { api } from '../lib/api'
import { useSession } from '../lib/session'
import type { User, Workspace } from '../lib/types'

const LAST_WORKSPACE_KEY = 'proto-zoo:last-workspace'

/**
 * App bootstrap: syncs the current user and loads their workspaces. Owns the
 * "which workspace is selected" state so views stay presentational.
 */
export function useBootstrap() {
  const session = useSession()
  const [mounted, setMounted] = useState(false)
  const [me, setMe] = useState<User | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    let cancelled = false

    ;(async () => {
      try {
        const user = await api<User>('/api/me/sync', {
          method: 'POST',
          body: JSON.stringify({
            display_name: session.displayName,
            avatar_url: session.avatarUrl,
          }),
        })
        const list = await api<Workspace[]>('/api/workspaces')
        if (cancelled) return

        let remembered: string | null = null
        try {
          remembered = localStorage.getItem(LAST_WORKSPACE_KEY)
        } catch {
          /* storage unavailable */
        }

        setMe(user)
        setWorkspaces(list)
        setActiveWorkspaceId(list.find((w) => w.id === remembered)?.id ?? list[0]?.id ?? null)
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mounted, session])

  function selectWorkspace(id: string) {
    setActiveWorkspaceId(id)
    try {
      localStorage.setItem(LAST_WORKSPACE_KEY, id)
    } catch {
      /* ignore */
    }
  }

  async function createWorkspace(name: string) {
    const workspace = await api<Workspace>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    setWorkspaces((prev) => [...prev, workspace])
    selectWorkspace(workspace.id)
    return workspace
  }

  return {
    mounted,
    me,
    workspaces,
    activeWorkspaceId,
    selectWorkspace,
    createWorkspace,
    status,
    error,
  }
}
