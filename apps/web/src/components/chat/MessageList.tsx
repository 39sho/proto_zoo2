import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { MessageRow } from './MessageRow'
import type { ReactionSummary } from '../../hooks/useReactions'
import type { Message, User } from '../../lib/types'
import { Skeleton } from '../ui/skeleton'

export function MessageList({
  messages,
  me,
  reactionsByMessage,
  isLoading,
  isError,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onOpenThread,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenPicker,
}: {
  messages: Message[]
  me: User
  reactionsByMessage: Map<string, Map<string, ReactionSummary>>
  isLoading: boolean
  isError: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  onOpenThread: (messageId: string) => void
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void
  onOpenPicker: (event: React.MouseEvent<HTMLButtonElement>, messageId: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const didInitialScrollRef = useRef(false)
  const pendingPrependRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const prevCountRef = useRef(0)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
    getItemKey: (index) => messages[index]?.id ?? index,
  })

  // Keep pinned to the newest message, but never yank the view while the user
  // is reading history above.
  useEffect(() => {
    if (messages.length === 0) return
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true
      requestAnimationFrame(() =>
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' }),
      )
      return
    }
    if (atBottomRef.current) {
      requestAnimationFrame(() =>
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  // Compensate scrollTop when older messages are prepended above the viewport.
  useLayoutEffect(() => {
    const el = parentRef.current
    const pending = pendingPrependRef.current
    if (el && pending && messages.length > prevCountRef.current) {
      const delta = el.scrollHeight - pending.scrollHeight
      if (delta > 0) el.scrollTop = pending.scrollTop + delta
      pendingPrependRef.current = null
    }
    prevCountRef.current = messages.length
  }, [messages.length])

  function handleScroll() {
    const el = parentRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 200 && hasNextPage && !isFetchingNextPage) {
      pendingPrependRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
      fetchNextPage()
    }
  }

  return (
    <div ref={parentRef} onScroll={handleScroll} data-testid="message-list" className="relative flex-1 overflow-y-auto p-4">
      {isFetchingNextPage && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
          Loading history…
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}
      {isError && <div className="text-sm text-muted-foreground">Could not load messages</div>}
      {!isLoading && messages.length === 0 && (
        <div className="p-4 text-sm text-muted-foreground">No messages yet. Say hello.</div>
      )}

      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const message = messages[row.index]
          if (!message) return null
          return (
            <div
              key={message.id}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <MessageRow
                message={message}
                isMine={message.author_id === me.id}
                reactions={reactionsByMessage.get(message.id)}
                onToggleReaction={onToggleReaction}
                onOpenPicker={onOpenPicker}
                onOpenThread={onOpenThread}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
