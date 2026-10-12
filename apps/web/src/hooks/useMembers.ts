import { useCallback, useEffect, useState } from 'react'

import { api } from '../lib/api'
import { reportError } from '../lib/toast'
import type { Channel, Member } from '../lib/types'

/** Workspace + (private) channel membership, with the mutating actions. */
export function useMembers(workspaceId: string, channel: Channel | null, meId: string) {
  const isPrivate = channel?.visibility === 'private'
  const channelId = channel?.id ?? null

  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>([])
  const [channelMembers, setChannelMembers] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setWorkspaceMembers(await api<Member[]>(`/api/workspaces/${workspaceId}/members`))
      setChannelMembers(
        channelId && isPrivate ? await api<Member[]>(`/api/channels/${channelId}/members`) : [],
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      reportError(e)
    }
  }, [workspaceId, channelId, isPrivate])

  useEffect(() => {
    void reload()
  }, [reload])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      reportError(e)
    }
  }

  const meRow = workspaceMembers.find((m) => m.user_id === meId)
  const isWorkspaceAdmin = meRow?.role === 'owner' || meRow?.role === 'admin'

  function addChannelMember(userId: string) {
    if (!channelId) return
    void run(() =>
      api(`/api/channels/${channelId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      }),
    )
  }

  function removeChannelMember(userId: string) {
    if (!channelId) return
    void run(() => api(`/api/channels/${channelId}/members/${userId}`, { method: 'DELETE' }))
  }

  function setWorkspaceRole(userId: string, role: string) {
    void run(() =>
      api(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    )
  }

  return {
    isPrivate,
    workspaceMembers,
    channelMembers,
    isWorkspaceAdmin,
    error,
    addChannelMember,
    removeChannelMember,
    setWorkspaceRole,
  }
}
