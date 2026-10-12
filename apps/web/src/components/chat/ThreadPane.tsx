import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Composer } from './Composer'
import { useThread } from '../../hooks/useThread'
import { formatTime, initials, type Channel, type Message, type User } from '../../lib/types'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'

function StaticMessage({ message }: { message: Message }) {
  return (
    <div className="flex gap-3">
      <Avatar className="size-9">
        {message.author_avatar_url && <AvatarImage src={message.author_avatar_url} alt="" />}
        <AvatarFallback className="bg-brand text-xs font-semibold text-primary-foreground">
          {initials(message.author_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{message.author_name}</span>
          <span className="text-[0.72rem] text-muted-foreground">
            {formatTime(message.created_at)}
          </span>
          {message.edited_at && (
            <span className="text-[0.7rem] text-muted-foreground">(edited)</span>
          )}
        </div>
        <div className="whitespace-pre-wrap break-words leading-snug">{message.content}</div>
      </div>
    </div>
  )
}

export function ThreadPane({
  root,
  channel,
  me,
  onClose,
}: {
  root: Message
  channel: Channel
  me: User
  onClose: () => void
}) {
  const { replies, isLoading, send } = useThread(channel.id, root.id, me)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [replies.length])

  return (
    <aside data-testid="thread-pane" className="flex w-full shrink-0 flex-col border-l border-border bg-app md:w-[360px]">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 font-bold">
        <span>Thread</span>
        <button
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-elevated hover:text-foreground"
          onClick={onClose}
          aria-label="Close thread"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="border-b border-border p-4">
        <StaticMessage message={root} />
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {replies.map((reply) => (
          <StaticMessage key={reply.id} message={reply} />
        ))}
        {!isLoading && replies.length === 0 && (
          <div className="text-sm text-muted-foreground">No replies yet. Start the thread.</div>
        )}
      </div>

      <Composer placeholder="Reply…" onSend={send} testId="thread" />
    </aside>
  )
}
