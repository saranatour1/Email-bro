import { defineConfig, globalIgnores } from 'eslint/config'
import { tanstackConfig } from '@tanstack/eslint-config'
import convexPlugin from '@convex-dev/eslint-plugin'

export default defineConfig([
  ...tanstackConfig,
  ...convexPlugin.configs.recommended,
  // src/components/ui is shadcn-generated; update it with `npx shadcn add`, not by hand.
  globalIgnores(['convex/_generated', 'src/components/ui']),
])
