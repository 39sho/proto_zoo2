import { eq, useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'

import { messagesCollection } from '../lib/collections'
import { trackTransaction } from '../lib/toast'
import type { Message, User } from '../lib/types'

/** Replies to a thread root — a live query over the channel's messages collection. */
export function useThread(channelId: string, rootId: string, me: User) {
  const collection = messagesCollection(channelId)
  const { data, isLoading } = useLiveQuery((q) =>
    q
      .from({ message: collection })
      .where(({ message }) => eq(message.parent_id, rootId))
      .orderBy(({ message }) => message.created_at, 'asc'),
  )

  const replies: Message[] = useMemo(
    () => [...(data ?? [])].filter((message) => !message.deleted_at),
    [data],
  )

  function send(content: string) {
    const trimmed = content.trim()
    if (!trimmed) return
    trackTransaction(
      collection.insert({
        id: crypto.randomUUID(),
        channel_id: channelId,
        author_id: me.id,
        author_name: me.display_name,
        author_avatar_url: me.avatar_url,
        content: trimmed,
        parent_id: rootId,
        is_reply: true,
        reply_count: 0,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      }),
    )
  }

  return { replies, isLoading, send }
}
