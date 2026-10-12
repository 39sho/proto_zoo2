import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { ChannelRail } from '../components/chat/ChannelRail'
import { CreateWorkspaceDialog } from '../components/chat/CreateWorkspaceDialog'
import { WorkspaceChat } from '../components/chat/WorkspaceChat'
import { Button } from '../components/ui/button'
import { useBootstrap } from '../hooks/useBootstrap'
import { Splash, useSession } from '../lib/session'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const session = useSession()
  const {
    mounted,
    me,
    workspaces,
    activeWorkspaceId,
    selectWorkspace,
    createWorkspace,
    status,
    error,
  } = useBootstrap()
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)

  if (!mounted || status === 'loading') return <Splash />
  if (status === 'error') return <div className="p-12 text-danger">Failed to load: {error}</div>

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  return (
    <div className="flex h-screen overflow-hidden bg-app text-foreground">
      <ChannelRail
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={selectWorkspace}
        onNewWorkspace={() => setNewWorkspaceOpen(true)}
      />

      {activeWorkspace && me ? (
        <WorkspaceChat
          key={activeWorkspace.id}
          workspace={activeWorkspace}
          me={me}
          sessionName={session.displayName}
          sessionAvatar={session.avatarUrl}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>No workspaces yet.</p>
          <Button onClick={() => setNewWorkspaceOpen(true)}>Create a workspace</Button>
        </div>
      )}

      <CreateWorkspaceDialog
        open={newWorkspaceOpen}
        onOpenChange={setNewWorkspaceOpen}
        onCreate={createWorkspace}
      />
    </div>
  )
}
