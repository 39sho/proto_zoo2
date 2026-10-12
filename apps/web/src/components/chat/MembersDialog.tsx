import { useMembers } from '../../hooks/useMembers'
import { initials, type Channel, type Member, type User, type Workspace } from '../../lib/types'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

function RoleChip({ role }: { role: string }) {
  const styles =
    role === 'owner'
      ? 'bg-amber-500/15 text-amber-400'
      : role === 'admin'
        ? 'bg-blue-500/15 text-blue-400'
        : 'bg-elevated text-muted-foreground'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.7rem] tracking-wide uppercase ${styles}`}>
      {role}
    </span>
  )
}

function MemberRow({
  member,
  children,
}: {
  member: Member
  children?: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-2.5">
      <Avatar className="size-7">
        {member.avatar_url && <AvatarImage src={member.avatar_url} alt="" />}
        <AvatarFallback className="bg-brand text-[0.7rem] font-semibold text-primary-foreground">
          {initials(member.display_name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate">{member.display_name}</span>
      {children}
    </li>
  )
}

export function MembersDialog({
  workspace,
  channel,
  me,
  onClose,
}: {
  workspace: Workspace
  channel: Channel | null
  me: User
  onClose: () => void
}) {
  const {
    isPrivate,
    workspaceMembers,
    channelMembers,
    isWorkspaceAdmin,
    error,
    addChannelMember,
    removeChannelMember,
    setWorkspaceRole,
  } = useMembers(workspace.id, channel, me.id)

  const channelIds = new Set(channelMembers.map((m) => m.user_id))
  const addable = workspaceMembers.filter((m) => !channelIds.has(m.user_id))

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Members{channel ? ` · ${isPrivate ? '' : '#'}${channel.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isPrivate && channel && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Channel members
            </h3>
            <ul className="flex flex-col gap-2">
              {channelMembers.map((member) => (
                <MemberRow key={member.user_id} member={member}>
                  <RoleChip role={member.role} />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => removeChannelMember(member.user_id)}
                  >
                    Remove
                  </Button>
                </MemberRow>
              ))}
            </ul>

            <h3 className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Add to channel
            </h3>
            <ul className="flex flex-col gap-2">
              {addable.map((member) => (
                <MemberRow key={member.user_id} member={member}>
                  <Button variant="ghost" size="xs" onClick={() => addChannelMember(member.user_id)}>
                    Add
                  </Button>
                </MemberRow>
              ))}
              {addable.length === 0 && (
                <li className="text-sm text-muted-foreground">Everyone is already here.</li>
              )}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Workspace members
          </h3>
          <ul className="flex flex-col gap-2">
            {workspaceMembers.map((member) => (
              <MemberRow key={member.user_id} member={member}>
                {isWorkspaceAdmin && member.role !== 'owner' ? (
                  <select
                    value={member.role}
                    onChange={(e) => setWorkspaceRole(member.user_id, e.target.value)}
                    aria-label={`Role for ${member.display_name}`}
                    className="rounded-md border border-border bg-field px-2 py-1 text-sm"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                ) : (
                  <RoleChip role={member.role} />
                )}
              </MemberRow>
            ))}
          </ul>
          {!isWorkspaceAdmin && (
            <p className="text-sm text-muted-foreground">
              Only owners/admins can change roles.
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}
