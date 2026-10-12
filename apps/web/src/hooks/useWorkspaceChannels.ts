import { useEffect, useState } from 'react'

import { useChannels } from './useChannels'
import type { Channel, ChannelVisibility } from '../lib/types'

/**
 * Owns the workspace's channel list AND which channel is selected. The
 * workspace view uses this; the sidebar and chat are views over its result.
 */
export function useWorkspaceChannels(workspaceId: string) {
  const { channels, isLoading, isError, createChannel } = useChannels(workspaceId)
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannelId(channels[0].id)
    }
  }, [channels, activeChannelId])

  const activeChannel: Channel | null =
    channels.find((c) => c.id === activeChannelId) ?? null

  function selectChannel(id: string) {
    setActiveChannelId(id)
  }

  async function create(name: string, visibility: ChannelVisibility) {
    await createChannel(name, visibility)
  }

  return {
    channels,
    activeChannel,
    activeChannelId,
    selectChannel,
    createChannel: create,
    isLoading,
    isError,
  }
}
