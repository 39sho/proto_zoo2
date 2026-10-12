import { cn } from 'cn'
import { Lock, Plus, Users } from 'lucide-react'
import { useState } from 'react'

import { CreateChannelDialog } from './CreateChannelDialog'
import { ModeToggle } from '../theme/ModeToggle'
import { UserChip } from '../../lib/session'
import type { Channel, ChannelVisibility } from '../../lib/types'

export function ChannelSidebar({
  workspaceName,
  sessionName,
  sessionAvatar,
  channels,
  isLoading,
  isError,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  onOpenMembers,
  className,
}: {
  workspaceName: string
  sessionName: string
  sessionAvatar: string | null
  channels: Channel[]
  isLoading: boolean
  isError: boolean
  activeChannelId: string | null
  onSelectChannel: (id: string) => void
  onCreateChannel: (name: string, visibility: ChannelVisibility) => Promise<void>
  onOpenMembers: () => void
  className?: string
}) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <aside className={cn('w-full shrink-0 flex-col bg-sidebar md:w-[260px]', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="truncate font-bold">{workspaceName}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenMembers}
            aria-label="Members"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <Users className="size-4" />
          </button>
          <ModeToggle />
          <UserChip name={sessionName} avatarUrl={sessionAvatar} />
        </div>
      </header>

      <div className="flex items-center justify-between px-4 pt-4 pb-1 text-xs tracking-wide text-muted-foreground uppercase">
        <span>Channels</span>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="New channel"
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isLoading && <div className="p-2 text-sm text-muted-foreground">Loading channels…</div>}
        {isError && (
          <div className="p-2 text-sm text-muted-foreground">Could not load channels</div>
        )}
        {channels.map((channel) => {
          const active = channel.id === activeChannelId
          return (
            <button
              key={channel.id}
              data-testid="channel-item"
              onClick={() => onSelectChannel(channel.id)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left',
                active
                  ? 'bg-elevated text-foreground'
                  : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
              )}
            >
              {channel.visibility === 'private' ? (
                <Lock className="size-3.5 shrink-0" />
              ) : (
                <span className="font-semibold text-muted-foreground">#</span>
              )}
              <span className="truncate">{channel.name}</span>
            </button>
          )
        })}
      </div>

      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={onCreateChannel}
      />
    </aside>
  )
}
