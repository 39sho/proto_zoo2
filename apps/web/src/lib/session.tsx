import { ClerkProvider, SignIn, UserButton, useAuth, useUser } from '@clerk/tanstack-react-start'
import { createContext, useContext, useMemo, type ReactNode } from 'react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

export const hasClerk = Boolean(PUBLISHABLE_KEY)

/**
 * Client-side auth adapter. Everything else in the app depends only on this
 * shape, never on a specific provider. To add a self-hosted OIDC IdP, write an
 * adapter that returns its access token from `getToken` (e.g. via
 * `oidc-client-ts` + PKCE) and select it in `<AuthProvider>` below — the Rust
 * server already verifies any OIDC JWKS, and the Electric shapes only ever see
 * the forwarded bearer token.
 */
export interface AuthAdapter {
  displayName: string
  avatarUrl: string | null
  /** Returns a fresh bearer token, or null when unauthenticated / dev mode. */
  getToken: () => Promise<string | null>
}

export type Session = AuthAdapter

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used within <AuthProvider>')
  return session
}

// Module-level token accessor so the Electric shape client (constructed at
// module scope) can attach a fresh bearer token to every request.
let tokenGetter: () => Promise<string | null> = async () => null

export function getAuthToken(): Promise<string | null> {
  return tokenGetter()
}

export async function authHeader(): Promise<string> {
  const token = await tokenGetter()
  return token ? `Bearer ${token}` : ''
}

/** Stable options object for `useShape`; the value is resolved per request. */
export const electricHeaders = { Authorization: authHeader }

export function AuthProvider({ children }: { children: ReactNode }) {
  if (PUBLISHABLE_KEY) {
    return (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <ClerkSession>{children}</ClerkSession>
      </ClerkProvider>
    )
  }
  return <DevSession>{children}</DevSession>
}

function ClerkSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()

  const session = useMemo<Session>(
    () => ({
      displayName:
        user?.fullName ||
        user?.username ||
        user?.primaryEmailAddress?.emailAddress ||
        'User',
      avatarUrl: user?.imageUrl ?? null,
      getToken: () => getToken(),
    }),
    [user, getToken],
  )

  // Assigned during render (not in an effect) so child effects can rely on it.
  tokenGetter = session.getToken

  if (!isLoaded) return <Splash />
  if (!isSignedIn) return <SignInScreen />
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

function DevSession({ children }: { children: ReactNode }) {
  const session = useMemo<Session>(
    () => ({
      displayName: 'Dev User',
      avatarUrl: null,
      getToken: async () => null,
    }),
    [],
  )
  tokenGetter = session.getToken
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function Splash() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="size-9 animate-spin rounded-full border-[3px] border-border border-t-brand" />
    </div>
  )
}

function SignInScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-xl font-bold">proto zoo</h1>
        <p className="mb-4 text-muted-foreground">Sign in to continue</p>
        <SignIn routing="hash" />
      </div>
    </div>
  )
}

export function UserChip({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (hasClerk) {
    return <UserButton />
  }
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span
        className="size-[26px] shrink-0 rounded-full bg-brand bg-cover bg-center"
        style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
      />
      <span>{name}</span>
    </div>
  )
}
