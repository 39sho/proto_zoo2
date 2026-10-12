import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'

import { reactionsCollection } from '../lib/collections'
import { trackTransaction } from '../lib/toast'
import { reactionKey } from '../lib/types'

export type ReactionSummary = { count: number; mine: boolean }

/** Reactions for a channel, aggregated per message + emoji. */
export function useReactions(channelId: string, meId: string) {
  const collection = reactionsCollection(channelId)
  const { data } = useLiveQuery((q) => q.from({ reaction: collection }))

  const byMessage = useMemo(() => {
    const map = new Map<string, Map<string, ReactionSummary>>()
    for (const reaction of data ?? []) {
      let byEmoji = map.get(reaction.message_id)
      if (!byEmoji) {
        byEmoji = new Map()
        map.set(reaction.message_id, byEmoji)
      }
      const entry = byEmoji.get(reaction.emoji) ?? { count: 0, mine: false }
      entry.count += 1
      if (reaction.user_id === meId) entry.mine = true
      byEmoji.set(reaction.emoji, entry)
    }
    return map
  }, [data, meId])

  function toggle(messageId: string, emoji: string, mine: boolean) {
    trackTransaction(
      mine
        ? collection.delete(reactionKey(messageId, meId, emoji))
        : collection.insert({
            message_id: messageId,
            user_id: meId,
            channel_id: channelId,
            emoji,
            created_at: new Date().toISOString(),
          }),
    )
  }

  return { byMessage, toggle }
}
