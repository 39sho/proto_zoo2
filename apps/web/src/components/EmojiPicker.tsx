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
 * Headless frimousse picker styled with Tailwind to match the app theme. Emoji
 * data is self-hosted under /emojibase-data so there is no runtime CDN
 * dependency. Frimousse's own `[frimousse-*]` internals are themed in
 * styles.css.
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
      className="flex flex-col gap-1.5"
    >
      {recents.length > 0 && (
        <div className="flex flex-wrap gap-0.5 border-b border-border pb-1.5">
          {recents.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-md px-1 py-0.5 text-[1.1rem] leading-none hover:bg-elevated"
              onClick={() => choose(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <Frimousse.Search
        className="w-full rounded-lg border border-transparent bg-field px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand"
        placeholder="Search emoji…"
        autoFocus
        aria-label="Search emoji"
      />
      <Frimousse.Viewport className="h-[260px]">
        <Frimousse.Loading className="block p-3 text-center text-xs text-muted-foreground">
          Loading…
        </Frimousse.Loading>
        <Frimousse.Empty className="block p-3 text-center text-xs text-muted-foreground">
          No emoji found.
        </Frimousse.Empty>
        <Frimousse.List />
      </Frimousse.Viewport>
    </Frimousse.Root>
  )
}
