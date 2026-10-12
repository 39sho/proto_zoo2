import { eq, useLiveInfiniteQuery } from '@tanstack/react-db'
import { useMemo } from 'react'

import { messagesCollection } from '../lib/collections'
import { trackTransaction } from '../lib/toast'
import type { Message, User } from '../lib/types'

/**
 * Top-level messages for a channel: windowed (on-demand) read plus optimistic
 * send/edit/delete. Threads are a separate live query over the same collection.
 */
export function useMessages(channelId: string, me: User) {
  const collection = messagesCollection(channelId)
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLiveInfiniteQuery(
      (q) =>
        q
          .from({ message: collection })
          .where(({ message }) => eq(message.is_reply, false))
          .orderBy(({ message }) => message.created_at, 'desc'),
      { pageSize: 50 },
    )

  const messages: Message[] = useMemo(
    () =>
      [...(data ?? [])]
        .filter((message) => !message.deleted_at)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
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
        parent_id: null,
        is_reply: false,
        reply_count: 0,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      }),
    )
  }

  function edit(id: string, content: string) {
    trackTransaction(
      collection.update(id, (draft) => {
        draft.content = content
        draft.edited_at = new Date().toISOString()
      }),
    )
  }

  function remove(id: string) {
    trackTransaction(collection.delete(id))
  }

  return {
    messages,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    send,
    edit,
    remove,
  }
}
