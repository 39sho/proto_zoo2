import { Plus } from 'lucide-react'

import { initials, type Workspace } from '../../lib/types'

export function ChannelRail({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onNewWorkspace,
}: {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelect: (id: string) => void
  onNewWorkspace: () => void
}) {
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
      {workspaces.map((workspace) => {
        const active = workspace.id === activeWorkspaceId
        return (
          <button
            key={workspace.id}
            title={workspace.name}
            onClick={() => onSelect(workspace.id)}
            className={`flex size-12 items-center justify-center rounded-2xl font-semibold transition-all ${
              active
                ? 'rounded-xl bg-brand text-primary-foreground'
                : 'bg-elevated text-muted-foreground hover:rounded-xl hover:bg-brand hover:text-primary-foreground'
            }`}
          >
            {initials(workspace.name)}
          </button>
        )
      })}
      <button
        title="New workspace"
        aria-label="New workspace"
        onClick={onNewWorkspace}
        className="flex size-12 items-center justify-center rounded-2xl bg-elevated text-muted-foreground transition-all hover:rounded-xl hover:bg-brand hover:text-primary-foreground"
      >
        <Plus className="size-5" />
      </button>
    </nav>
  )
}
