import { cn } from 'cn'
import { useState } from 'react'

import { ChannelSidebar } from './ChannelSidebar'
import { ChatView } from './ChatView'
import { MembersDialog } from './MembersDialog'
import { useWorkspaceChannels } from '../../hooks/useWorkspaceChannels'
import type { User, Workspace } from '../../lib/types'

/**
 * A workspace: the channel sidebar and the open channel. Owns channel selection
 * and the mobile "channels vs chat" pane toggle.
 */
export function WorkspaceChat({
  workspace,
  me,
  sessionName,
  sessionAvatar,
}: {
  workspace: Workspace
  me: User
  sessionName: string
  sessionAvatar: string | null
}) {
  const { channels, activeChannel, activeChannelId, selectChannel, createChannel, isLoading, isError } =
    useWorkspaceChannels(workspace.id)
  const [membersOpen, setMembersOpen] = useState(false)
  const [mobilePane, setMobilePane] = useState<'channels' | 'chat'>('channels')

  return (
    <>
      <ChannelSidebar
        workspaceName={workspace.name}
        sessionName={sessionName}
        sessionAvatar={sessionAvatar}
        channels={channels}
        isLoading={isLoading}
        isError={isError}
        activeChannelId={activeChannelId}
        onSelectChannel={(id) => {
          selectChannel(id)
          setMobilePane('chat')
        }}
        onCreateChannel={createChannel}
        onOpenMembers={() => setMembersOpen(true)}
        className={cn(mobilePane === 'channels' ? 'flex' : 'hidden', 'md:flex')}
      />

      <main
        className={cn('min-w-0 flex-1', mobilePane === 'chat' ? 'flex' : 'hidden', 'md:flex')}
      >
        {activeChannel ? (
          <ChatView
            channel={activeChannel}
            me={me}
            onOpenMembers={() => setMembersOpen(true)}
            onBack={() => setMobilePane('channels')}
          />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Select a channel</div>
        )}
      </main>

      {membersOpen && (
        <MembersDialog
          workspace={workspace}
          channel={activeChannel}
          me={me}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </>
  )
}
