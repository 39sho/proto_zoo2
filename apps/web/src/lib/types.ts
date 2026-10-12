export type User = {
  id: string
  external_id: string
  display_name: string
  email: string | null
  avatar_url: string | null
  created_at: string
}

export type Workspace = {
  id: string
  name: string
  slug: string
  created_by: string
  created_at: string
}

export type ChannelVisibility = 'public' | 'private'

export type Channel = {
  id: string
  workspace_id: string
  name: string
  topic: string | null
  visibility: ChannelVisibility
  created_at: string
}

export type Message = {
  id: string
  channel_id: string
  author_id: string
  author_name: string
  author_avatar_url: string | null
  content: string
  parent_id: string | null
  is_reply: boolean
  reply_count: number
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

export type Member = {
  user_id: string
  display_name: string
  avatar_url: string | null
  role: string
}

export type Reaction = {
  message_id: string
  user_id: string
  channel_id: string
  emoji: string
  created_at: string
}

/** Matches the collection `getKey`, since reactions have a composite primary key. */
export function reactionKey(messageId: string, userId: string, emoji: string): string {
  return `${messageId}:${userId}:${emoji}`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
