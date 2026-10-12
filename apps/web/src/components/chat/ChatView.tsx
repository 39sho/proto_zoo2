import { ChevronLeft, Lock } from 'lucide-react'
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { ThreadPane } from './ThreadPane'
import { EmojiPicker } from '../EmojiPicker'
import { useMessages } from '../../hooks/useMessages'
import { useReactions } from '../../hooks/useReactions'
import type { Channel, User } from '../../lib/types'
import { Button } from '../ui/button'

const PICKER_WIDTH = 300
const PICKER_HEIGHT = 360

export function ChatView({
  channel,
  me,
  onOpenMembers,
  onBack,
}: {
  channel: Channel
  me: User
  onOpenMembers: () => void
  onBack?: () => void
}) {
  const {
    messages,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    send,
    edit,
    remove,
  } = useMessages(channel.id, me)
  const { byMessage, toggle } = useReactions(channel.id, me.id)

  const [picker, setPicker] = useState<{ messageId: string; x: number; y: number } | null>(null)
  const [threadRootId, setThreadRootId] = useState<string | null>(null)

  useEffect(() => {
    if (!picker) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicker(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [picker])

  function openPicker(event: ReactMouseEvent<HTMLButtonElement>, messageId: string) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(8, rect.left), window.innerWidth - PICKER_WIDTH - 8)
    const y =
      rect.bottom + PICKER_HEIGHT + 8 > window.innerHeight
        ? Math.max(8, rect.top - PICKER_HEIGHT - 6)
        : rect.bottom + 6
    setPicker({ messageId, x, y })
  }

  const threadRoot = threadRootId
    ? (messages.find((m) => m.id === threadRootId) ?? null)
    : null

  return (
    <div className="relative flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to channels"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-elevated hover:text-foreground md:hidden"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          {channel.visibility === 'private' ? (
            <Lock className="size-4 text-muted-foreground" />
          ) : (
            <span className="font-semibold text-muted-foreground">#</span>
          )}
          <span className="font-bold">{channel.name}</span>
          {channel.topic && (
            <span className="border-l border-border pl-2 text-sm text-muted-foreground max-sm:hidden">
              {channel.topic}
            </span>
          )}
          {channel.visibility === 'private' && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={onOpenMembers}>
              Members
            </Button>
          )}
        </header>

        <MessageList
          messages={messages}
          me={me}
          reactionsByMessage={byMessage}
          isLoading={isLoading}
          isError={isError}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          onOpenThread={setThreadRootId}
          onEdit={edit}
          onDelete={remove}
          onToggleReaction={toggle}
          onOpenPicker={openPicker}
        />

        <Composer placeholder={`Message #${channel.name}`} onSend={send} />
      </div>

      {threadRoot && (
        <div className="absolute inset-0 z-40 flex bg-app md:static md:z-auto md:bg-transparent">
          <ThreadPane
            key={threadRoot.id}
            root={threadRoot}
            channel={channel}
            me={me}
            onClose={() => setThreadRootId(null)}
          />
        </div>
      )}

      {picker &&
        createPortal(
          <div className="fixed inset-0 z-[60]" onClick={() => setPicker(null)}>
            <div
              className="absolute z-[61] rounded-xl border border-border bg-sidebar p-2 shadow-xl"
              style={{ left: picker.x, top: picker.y, width: PICKER_WIDTH }}
              onClick={(e) => e.stopPropagation()}
            >
              <EmojiPicker
                onSelect={(emoji) => {
                  const mine = Boolean(byMessage.get(picker.messageId)?.get(emoji)?.mine)
                  toggle(picker.messageId, emoji, mine)
                  setPicker(null)
                }}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
