import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

// Clerk is optional for local development. It is only wired in when the
// publishable key is present, so the app runs without any Clerk secrets.
const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

export const startInstance = createStart(() => {
  return {
    requestMiddleware: clerkEnabled
      ? [csrfMiddleware, clerkMiddleware()]
      : [csrfMiddleware],
  }
})
