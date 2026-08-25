/**
 * Validation for the caller-supplied `return_url` on the portal payment success
 * pages.
 *
 * Those pages are unauthenticated and reachable by anyone, so an unchecked
 * redirect target turns the billing domain into a phishing redirector: an
 * attacker hands a victim a link on our billing host, the victim sees a payment
 * confirmation, and then lands wherever the attacker chose.
 *
 * The legitimate return is genuinely cross-origin (billing origin back to the
 * embedding portal), so the relative-path test used by the login and
 * registration forms is not applicable here. Instead the target origin must
 * match an operator-configured allowlist exactly.
 */

/**
 * Parses an absolute http(s) URL, or returns `null`.
 *
 * Restricting the scheme rejects `javascript:`, `data:` and `blob:` targets.
 * Those parse successfully but either execute in our own origin or carry an
 * opaque origin of the literal string "null", which would otherwise compare
 * equal to another opaque origin in the allowlist.
 */
const parseHttpUrl = (value: string): URL | null => {
  let url: URL
  try {
    // No base is supplied on purpose: a relative value must fail rather than
    // resolve against whatever origin happens to be serving the page.
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  return url
}

/**
 * Parses the configured allowlist. Entries that are not absolute http(s) URLs
 * are dropped rather than widening the allowlist to something unintended.
 */
export const parseAllowedOrigins = (raw: string | undefined | null): string[] => {
  if (!raw) return []

  const origins = raw
    .split(',')
    .map(entry => parseHttpUrl(entry.trim()))
    .filter((url): url is URL => url !== null)
    .map(url => url.origin)

  return [...new Set(origins)]
}

/**
 * Returns the URL to redirect to, or `null` when the caller-supplied value is
 * absent, unparseable, or not on the allowlist. Callers must treat `null` as
 * "do not redirect". There is deliberately no fallback target.
 */
export const resolveReturnUrl = (
  raw: string | undefined | null,
  allowedOrigins: readonly string[]
): string | null => {
  if (!raw) return null
  if (allowedOrigins.length === 0) return null

  const url = parseHttpUrl(raw)
  if (url === null) return null

  // Origins are compared as parsed values rather than string prefixes, so
  // `https://portal.example.com.evil.com` cannot pass a check intended for
  // `https://portal.example.com`.
  if (!allowedOrigins.includes(url.origin)) return null

  // Hand back the parser's own serialization, so the value the browser is given
  // is exactly the one that was validated.
  return url.toString()
}
