import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'

import { API_BASE_URL, api } from './api'
import { electricHeaders } from './session'
import type { Channel, Message, Reaction } from './types'

// Collections are Electric-backed and scoped by id, so we memoise one per
// workspace / channel instead of creating a new stream on every render.
//
// DX: every collection is registered so the in-app inspector (DevPanel, enabled
// in dev via the floating "shapes" button) can show its status and row count.
type Inspectable = {
  status: string
  isReady: () => boolean
  size: number
}

export type CollectionInfo = {
  id: string
  scope: string
  status: string
  ready: boolean
  rows: number
}

const registry = new Map<string, { info: Omit<CollectionInfo, 'status' | 'ready' | 'rows'>; collection: Inspectable }>()

function register<T extends Inspectable>(id: string, scope: string, collection: T): T {
  registry.set(id, { info: { id, scope }, collection })
  return collection
}

export function inspectCollections(): CollectionInfo[] {
  return [...registry.values()].map(({ info, collection }) => ({
    ...info,
    status: collection.status,
    ready: collection.isReady(),
    rows: collection.size,
  }))
}

type ChannelsCollection = ReturnType<typeof createChannelsCollection>

function createChannelsCollection(workspaceId: string) {
  return register(
    `channels:${workspaceId}`,
    `workspace ${workspaceId.slice(0, 8)}`,
    createCollection(
      electricCollectionOptions<Channel>({
        id: `channels:${workspaceId}`,
        getKey: (channel) => channel.id,
        shapeOptions: {
          url: `${API_BASE_URL}/api/shapes/channels`,
          params: { workspace_id: workspaceId },
          headers: electricHeaders,
        },
      }),
    ),
  )
}

const channelsCache = new Map<string, ChannelsCollection>()

export function channelsCollection(workspaceId: string): ChannelsCollection {
  let collection = channelsCache.get(workspaceId)
  if (!collection) {
    collection = createChannelsCollection(workspaceId)
    channelsCache.set(workspaceId, collection)
  }
  return collection
}

type MessagesCollection = ReturnType<typeof createMessagesCollection>

// One collection per channel holds both top-level messages and their thread
// replies. The main list and each open thread are just different live queries
// over this single collection (which keeps a write on one collection from
// starving sync on another — the reason we don't use a separate thread shape).
function createMessagesCollection(channelId: string) {
  return register(
    `messages:${channelId}`,
    `channel ${channelId.slice(0, 8)}`,
    createCollection(
      electricCollectionOptions<Message>({
        id: `messages:${channelId}`,
        getKey: (message) => message.id,
        syncMode: 'on-demand',
        shapeOptions: {
          url: `${API_BASE_URL}/api/shapes/messages`,
          params: { channel_id: channelId },
          headers: electricHeaders,
        },
        // Optimistic insert: persist, then wait for that exact Postgres
        // transaction to stream back before dropping the optimistic row.
        onInsert: async ({ transaction, collection }) => {
          const message = transaction.mutations[0].modified
          const result = await api<{ txid: number }>(
            `/api/channels/${message.channel_id}/messages`,
            {
              method: 'POST',
              body: JSON.stringify({
                id: message.id,
                content: message.content,
                parent_id: message.parent_id,
              }),
            },
          )
          await collection.utils.awaitTxId(result.txid)
        },
        onUpdate: async ({ transaction, collection }) => {
          const message = transaction.mutations[0].modified
          const result = await api<{ txid: number }>(`/api/messages/${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content: message.content }),
          })
          await collection.utils.awaitTxId(result.txid)
        },
        onDelete: async ({ transaction, collection }) => {
          const message = transaction.mutations[0].original
          const result = await api<{ txid: number }>(`/api/messages/${message.id}`, {
            method: 'DELETE',
          })
          await collection.utils.awaitTxId(result.txid)
        },
      }),
    ),
  )
}

const messagesCache = new Map<string, MessagesCollection>()

export function messagesCollection(channelId: string): MessagesCollection {
  let collection = messagesCache.get(channelId)
  if (!collection) {
    collection = createMessagesCollection(channelId)
    messagesCache.set(channelId, collection)
  }
  return collection
}

type ReactionsCollection = ReturnType<typeof createReactionsCollection>

// Reactions have a composite primary key; the client key mirrors it.
const reactionKey = (reaction: Reaction) =>
  `${reaction.message_id}:${reaction.user_id}:${reaction.emoji}`

function createReactionsCollection(channelId: string) {
  return register(
    `reactions:${channelId}`,
    `channel ${channelId.slice(0, 8)}`,
    createCollection(
      electricCollectionOptions<Reaction>({
        id: `reactions:${channelId}`,
        getKey: reactionKey,
        shapeOptions: {
          url: `${API_BASE_URL}/api/shapes/reactions`,
          params: { channel_id: channelId },
          headers: electricHeaders,
        },
        onInsert: async ({ transaction, collection }) => {
          const reaction = transaction.mutations[0].modified
          const result = await api<{ txid: number }>(
            `/api/messages/${reaction.message_id}/reactions`,
            { method: 'POST', body: JSON.stringify({ emoji: reaction.emoji }) },
          )
          await collection.utils.awaitTxId(result.txid)
        },
        onDelete: async ({ transaction, collection }) => {
          const reaction = transaction.mutations[0].original
          const result = await api<{ txid: number }>(
            `/api/messages/${reaction.message_id}/reactions/${encodeURIComponent(reaction.emoji)}`,
            { method: 'DELETE' },
          )
          await collection.utils.awaitTxId(result.txid)
        },
      }),
    ),
  )
}

const reactionsCache = new Map<string, ReactionsCollection>()

export function reactionsCollection(channelId: string): ReactionsCollection {
  let collection = reactionsCache.get(channelId)
  if (!collection) {
    collection = createReactionsCollection(channelId)
    reactionsCache.set(channelId, collection)
  }
  return collection
}
