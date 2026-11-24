import { convexAuthProvider } from '@convex-dev/auth/server'
import type { AuthConfig } from 'convex/server'

// Convex Auth signs access tokens with the deployment's own key, so there are no signing keys to manage.
export default { providers: [convexAuthProvider()] } satisfies AuthConfig
