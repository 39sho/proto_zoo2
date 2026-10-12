import { useLiveQuery } from '@tanstack/react-db'

import { api } from '../lib/api'
import { channelsCollection } from '../lib/collections'
import type { Channel, ChannelVisibility } from '../lib/types'

export function useChannels(workspaceId: string) {
  const { data, isLoading, isError } = useLiveQuery((q) =>
    q.from({ channel: channelsCollection(workspaceId) }),
  )

  const channels: Channel[] = [...(data ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )

  async function createChannel(name: string, visibility: ChannelVisibility) {
    await api(`/api/workspaces/${workspaceId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name, visibility }),
    })
  }

  return { channels, isLoading, isError, createChannel }
}
