import { setupConvexAuth } from '@convex-dev/auth/server'
import { setupGoogle } from '@convex-dev/auth/methods/google/server'
import { components, internal } from '../_generated/api'
import { env } from '../_generated/server'

const auth = setupConvexAuth({ component: components.auth })
export const { signOut, refreshSession, isAuthenticated } = auth

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins: [env.SITE_URL],
}).attachUserCallbacks({
  createUser: internal.models.users.auth.createUser,
  onSignIn: internal.models.users.auth.onSignIn,
})
