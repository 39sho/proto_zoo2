import { EmojiPicker as Frimousse } from 'frimousse'
import { useEffect, useState } from 'react'

const RECENTS_KEY = 'proto-zoo:recent-emoji'
const MAX_RECENTS = 16

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : []
  } catch {
    return []
  }
}

function pushRecent(emoji: string): string[] {
  const next = [emoji, ...loadRecents().filter((e) => e !== emoji)].slice(0, MAX_RECENTS)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    // storage may be unavailable; recents are best-effort
  }
  return next
}

/**
 * Headless frimousse picker styled to match the app's dark theme. Emoji data is
 * self-hosted under /emojibase-data so there is no runtime CDN dependency.
 */
export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    setRecents(loadRecents())
  }, [])

  function choose(emoji: string) {
    setRecents(pushRecent(emoji))
    onSelect(emoji)
  }

  return (
    <Frimousse.Root
      locale="en"
      columns={8}
      emojibaseUrl="/emojibase-data"
      onEmojiSelect={(emoji) => choose(emoji.emoji)}
      className="emoji-picker"
    >
      {recents.length > 0 && (
        <div className="emoji-recents">
          {recents.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-recent"
              onClick={() => choose(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <Frimousse.Search
        className="emoji-search"
        placeholder="Search emoji…"
        autoFocus
        aria-label="Search emoji"
      />
      <Frimousse.Viewport className="emoji-viewport">
        <Frimousse.Loading className="emoji-status">Loading…</Frimousse.Loading>
        <Frimousse.Empty className="emoji-status">No emoji found.</Frimousse.Empty>
        <Frimousse.List />
      </Frimousse.Viewport>
    </Frimousse.Root>
  )
}
