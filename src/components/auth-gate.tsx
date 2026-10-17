import { useState } from 'react'
import { useConvexAuth } from 'convex/react'
import { useOauth, useSignInWithGoogle } from '@convex-dev/auth/methods/google/react'
import type { ReactNode } from 'react'
import { api } from '~/lib/api'
import { Logo } from '~/components/logo'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const { isLoading, isAuthenticated } = useConvexAuth()
  if (isLoading) return <Centered>Signing you in…</Centered>
  return isAuthenticated ? <>{children}</> : <SignIn />
}

const SignIn = () => {
  const { signIn } = useSignInWithGoogle(api.auth)
  const { flowError } = useOauth()
  const [startError, setStartError] = useState<string | null>(null)
  const error =
    startError ??
    (flowError === null
      ? null
      : flowError.error === 'ACCESS_DENIED'
        ? 'Sign-in was cancelled.'
        : flowError.error === 'EXPIRED'
          ? 'That took too long. Please try again.'
          : 'Something went wrong signing in. Please try again.')

  return (
    <Centered>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Logo className="mx-auto mb-2 size-12" />
          <CardTitle>Email Bro</CardTitle>
          <CardDescription>All your inboxes, sorted. Only what matters up top.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            size="lg"
            onClick={async () => {
              setStartError(null)
              const result = await signIn()
              if (result.status !== 'redirect') setStartError("Couldn't start Google sign-in. Please try again.")
            }}
          >
            Continue with Google
          </Button>
          {error && (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </Centered>
  )
}

const Centered = ({ children }: { children: ReactNode }) => {
  return <main className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">{children}</main>
}
