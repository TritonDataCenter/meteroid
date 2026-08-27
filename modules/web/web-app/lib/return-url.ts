/**
 * Validation for caller-supplied redirect targets.
 *
 * Every page involved is unauthenticated and reachable by anyone, so an
 * unchecked target turns our own host into a phishing redirector: an attacker
 * hands a victim a link on a host they trust, the victim sees a page they
 * expect, and then lands wherever the attacker chose.
 *
 * Two different questions are asked here, and they have different answers.
 *
 * The portal payment success pages return to another origin (billing origin
 * back to the embedding portal), so their target must match an
 * operator-configured origin allowlist: `resolveReturnUrl`.
 *
 * The auth forms return to a page of this app, so their target must be a
 * same-origin path: `resolveSameOriginReturnUrl`. A `startsWith('/')` test on
 * the raw string does not decide that, and neither does comparing origins; see
 * that function for what does.
 */

/**
 * Parses an absolute http(s) URL, or returns `null`.
 *
 * Restricting the scheme rejects `javascript:`, `data:` and `blob:` targets.
 * `javascript:` and `data:` carry an opaque origin of the literal string
 * "null", which would otherwise compare equal to another opaque origin in the
 * allowlist. `blob:` is worse: it inherits the origin of its inner URL, so
 * `blob:https://portal.example.com/x` reports the allowed origin exactly while
 * being an entirely different kind of navigation.
 */
const parseHttpUrl = (value: string): URL | null => {
  let url: URL
  try {
    // No base is supplied on purpose: a relative or protocol-relative value
    // must fail rather than resolve against whatever origin happens to be
    // serving the page. Passing `window.location.origin` here would reopen the
    // hole this module exists to close.
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  return url
}

/**
 * Parses the configured allowlist down to bare origins. An entry that is not
 * an absolute http(s) URL is dropped rather than widening the allowlist to
 * something unintended; a bad entry fails closed the same as a bad
 * `return_url` does, since both go through the same `parseHttpUrl` gate.
 */
export const parseAllowedOrigins = (raw: string | undefined | null): string[] => {
  if (!raw) return []

  const origins = raw
    .split(',')
    .map(entry => parseHttpUrl(entry.trim())?.origin)
    .filter((origin): origin is string => origin !== undefined)

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

  // Embedded credentials survive serialization and are not part of the origin,
  // so they pass the check above. On the allowed host they still let a link
  // force an `Authorization: Basic` header of the attacker's choosing, raise
  // the browser's "log in as <name>" prompt against a host the victim trusts,
  // and make the link's hover preview read as some other domain.
  url.username = ''
  url.password = ''

  // Hand back the parser's own serialization rather than the caller's string,
  // so the value the browser is given is exactly the one that was validated and
  // no parser disagreement can sit between the two.
  return url.toString()
}

/**
 * The current page's origin, or `null` when there is not a usable one to
 * resolve a relative target against.
 *
 * `null` covers a non-browser host (the tests) and an opaque origin such as a
 * sandboxed iframe or a `file://` page, where the serialization is the literal
 * "null" and is not a URL base.
 */
const currentOrigin = (): string | null => {
  if (typeof location === 'undefined') return null

  const origin = location.origin
  return origin === '' || origin === 'null' ? null : origin
}

/**
 * Returns a same-origin path to navigate to, or `null` when the caller-supplied
 * value is absent or is not one. Callers must treat `null` as "use the default
 * destination"; there is deliberately no fallback target here.
 *
 * A `startsWith('/')` test on the raw string does not answer this question.
 * `/.\/evil.example` passes it, and the WHATWG parser then reads the backslash
 * as a path separator and folds the `.` segment away, leaving the resolved
 * pathname `//evil.example` on this very origin. React Router hands that bare
 * string to `history.pushState`, the browser re-resolves it against the
 * document as a protocol-relative URL, the call throws SecurityError, and the
 * history package's catch falls through to `location.assign` -- so the throw is
 * itself the off-site redirect.
 *
 * Comparing origins does not answer it either: the resolved URL's origin is our
 * own, which is exactly why the payload survives an origin check.
 *
 * The check that does answer it is on the RESOLVED pathname, whatever the raw
 * string looked like: reject a leading `//`.
 *
 * `origin` is a parameter only so tests can supply one; callers pass nothing.
 */
export const resolveSameOriginReturnUrl = (
  raw: string | undefined | null,
  origin: string | null = currentOrigin()
): string | null => {
  if (!raw) return null
  if (origin === null) return null

  // Refuses a scheme (`javascript:`), a still-encoded value, and a path
  // relative to the current page. It does NOT refuse a bare authority:
  // `//evil.example` starts with a slash and passes here. The origin
  // comparison below is what catches that.
  if (!raw.startsWith('/')) return null

  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return null
  }

  // A leading slash does not make a value ours: `//evil.example` and
  // `/\evil.example` both resolve to the attacker's origin.
  if (url.origin !== origin) return null

  // The essential check, per the note above.
  if (url.pathname.startsWith('//')) return null

  // Hand back the parser's own path rather than the caller's string, so the
  // value that gets navigated to is exactly the one that was validated and no
  // parser disagreement can sit between the two.
  return `${url.pathname}${url.search}${url.hash}`
}
