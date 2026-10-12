import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { ThemeProvider } from '../components/theme/ThemeProvider'
import { Toaster } from '../components/ui/sonner'
import { TooltipProvider } from '../components/ui/tooltip'
import { AuthProvider } from '../lib/session'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'proto zoo',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.remove('dark')}catch(e){}`

function RootDocument({ children }: { children: React.ReactNode }) {
  // The shape inspector mounts into its own React root so it never participates
  // in the app's tree (see devPanelMount.tsx).
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import('../components/devPanelMount').then((m) => m.mountDevPanel())
    }
  }, [])

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <AuthProvider>{children}</AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
        <Toaster position="bottom-right" richColors />
        <Scripts />
      </body>
    </html>
  )
}
