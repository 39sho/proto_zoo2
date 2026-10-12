import { useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import type { ReactionSummary } from '../../hooks/useReactions'
import { formatTime, initials, type Message } from '../../lib/types'

export function MessageRow({
  message,
  isMine,
  reactions,
  onToggleReaction,
  onOpenPicker,
  onOpenThread,
  onEdit,
  onDelete,
}: {
  message: Message
  isMine: boolean
  reactions: Map<string, ReactionSummary> | undefined
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void
  onOpenPicker: (event: ReactMouseEvent<HTMLButtonElement>, messageId: string) => void
  onOpenThread: (messageId: string) => void
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function save() {
    const content = editText.trim()
    setEditing(false)
    if (content && content !== message.content) onEdit(message.id, content)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      save()
    }
    if (event.key === 'Escape') setEditing(false)
  }

  const entries = [...(reactions?.entries() ?? [])]
  const actionClass =
    'rounded px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground'

  return (
    <div className="group/message flex gap-3 pb-3.5" data-testid="message">
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
          {!editing && (
            <span className="ml-1 flex gap-1 opacity-0 transition-opacity group-hover/message:opacity-100">
              <button
                className={actionClass}
                data-testid="message-reply"
                onClick={() => onOpenThread(message.id)}
              >
                Reply
              </button>
              {isMine && (
                <>
                  <button
                    className={actionClass}
                    data-testid="message-edit"
                    onClick={() => {
                      setEditText(message.content)
                      setEditing(true)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className={actionClass}
                    data-testid="message-delete"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </button>
                </>
              )}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              autoFocus
              rows={2}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={onKeyDown}
              className="w-full resize-y rounded-md border border-brand bg-field px-2.5 py-1.5 text-sm outline-none"
            />
            <div className="flex gap-2">
              <button
                className="rounded bg-brand px-2.5 py-1 text-sm font-semibold text-primary-foreground hover:bg-brand-hover"
                onClick={save}
              >
                Save
              </button>
              <button
                className="rounded bg-elevated px-2.5 py-1 text-sm hover:bg-accent"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words leading-snug" data-testid="message-content">
            {message.content}
          </div>
        )}

        {message.reply_count > 0 && (
          <button
            className="mt-1 text-xs font-semibold text-brand hover:underline"
            data-testid="thread-link"
            onClick={() => onOpenThread(message.id)}
          >
            {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
          </button>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {entries.map(([emoji, info]) => (
            <button
              key={emoji}
              data-testid="reaction"
              data-emoji={emoji}
              onClick={() => onToggleReaction(message.id, emoji, info.mine)}
              title={info.mine ? 'Remove reaction' : 'Add reaction'}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm leading-6 ${
                info.mine
                  ? 'border-brand bg-brand/20'
                  : 'border-transparent bg-elevated hover:border-border'
              }`}
            >
              <span>{emoji}</span>
              <span
                className={`text-[0.72rem] ${
                  info.mine ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {info.count}
              </span>
            </button>
          ))}
          <button
            data-testid="reaction-add"
            onClick={(e) => onOpenPicker(e, message.id)}
            title="Add reaction"
            className="rounded-full bg-elevated px-2 py-0.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            +
          </button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(message.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
