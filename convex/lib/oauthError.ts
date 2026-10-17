const OAUTH_ERRORS = new Set([
  'denied',
  'expired',
  'access_denied',
  'gmail_api_disabled',
  'connect_failed',
  'no_refresh_token',
])

// Google's error is one query value. Anything else, including an extra &connected=, becomes denied.
export const settingsError = (value: string | null | undefined) => (value && OAUTH_ERRORS.has(value) ? value : 'denied')
