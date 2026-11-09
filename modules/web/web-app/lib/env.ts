import { parseEnv } from '@md/common'
import { z } from 'zod/v3'

import { parseAllowedOrigins } from '@/lib/return-url'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const window = globalThis as any

if (!window._env) {
  window._env = import.meta.env
}

const _env = parseEnv(window._env, {
  VITE_METEROID_API_EXTERNAL_URL: z.string().default('http://127.0.0.1:50061'),
  VITE_METEROID_REST_API_EXTERNAL_URL: z.string().default('http://127.0.0.1:8080'),
  // enable developer experience mode
  VITE_DX: z.boolean().default(false),
  // todo move to feature flag service
  VITE_ENTITLEMENTS_ENABLED: z.boolean().default(false),
  // Comma-separated origins the portal payment success pages may redirect back
  // to. Defaults to deny-all: with nothing configured no redirect happens.
  VITE_PORTAL_RETURN_URL_ALLOWLIST: z.string().default(''),
})

export const env = {
  meteroidApiUri: _env.VITE_METEROID_API_EXTERNAL_URL,
  meteroidRestApiUri: _env.VITE_METEROID_REST_API_EXTERNAL_URL,
  dx: _env.VITE_DX,
  entitlementsEnabled: _env.VITE_ENTITLEMENTS_ENABLED,
  portalReturnUrlAllowlist: parseAllowedOrigins(_env.VITE_PORTAL_RETURN_URL_ALLOWLIST),
}
