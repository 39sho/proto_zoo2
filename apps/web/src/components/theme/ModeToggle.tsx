import { Moon, Sun } from 'lucide-react'

import { useTheme } from './ThemeProvider'

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
