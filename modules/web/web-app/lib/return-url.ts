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
 * Reports an allowlist entry that was thrown away.
 *
 * Dropping entries silently fails closed, which is right, but it leaves the
 * operator looking at a payment page where the redirect merely stopped
 * happening, with nothing anywhere to say why.
 */
const warnDroppedEntry = (entry: string, reason: string): void => {
  console.warn(
    `VITE_PORTAL_RETURN_URL_ALLOWLIST: ignoring ${JSON.stringify(entry)} (${reason}). ` +
      'Entries are comma-separated absolute http(s) origins, e.g. https://portal.example.com.'
  )
}

/**
 * A hostname: DNS labels separated by dots.
 *
 * No dot is required. A single label such as `intranet` is a perfectly valid
 * hostname on an internal network, and refusing it would drop a working
 * operator origin for no security gain.
 *
 * Underscores are accepted too. They are not RFC 1123, but browsers resolve
 * them and they turn up in internal naming, so treating them as garbage would
 * again drop an origin that really works.
 *
 * A leading or trailing hyphen is still refused: that is a genuine label rule
 * rather than a guess about what an operator meant.
 */
const DNS_HOSTNAME = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/

/** An IPv6 literal, which the parser hands back with its brackets attached. */
const IP_LITERAL = /^\[[0-9a-f:.]+\]$/

/**
 * Separators an operator might reach for instead of a comma. Neither is a
 * forbidden host code point, so a wrong one lands inside the parsed hostname
 * rather than failing the parse.
 */
const MISUSED_SEPARATOR = /[;&]/

/**
 * Describes why a hostname cannot correspond to a real host, or `null` when it
 * can.
 *
 * Very few characters are forbidden host code points, so a mistyped entry
 * usually parses into a plausible-looking origin that matches nothing: a `;`
 * separator gives `https://a.example;https://b.example` the hostname
 * `a.example;https`, and `https://*.example.com` keeps its `*`. An allowlist
 * built from those looks populated while denying every target, which is the
 * hardest failure for an operator to diagnose.
 *
 * The reason names the cause that actually applies. A confidently wrong
 * explanation is worse than a vague one, because it sends the operator after a
 * fix that will not work on a page that takes payments.
 */
const hostnameProblem = (hostname: string): string | null => {
  if (DNS_HOSTNAME.test(hostname) || IP_LITERAL.test(hostname)) return null

  const named = `${JSON.stringify(hostname)} is not a valid hostname`

  if (hostname.includes('*')) return `${named}; wildcards are not supported`

  const separator = hostname.match(MISUSED_SEPARATOR)
  if (separator !== null) {
    return `${named}; entries are separated by commas, not ${JSON.stringify(separator[0])}`
  }

  return named
}

/**
 * Parses the configured allowlist. Entries that are not absolute http(s) URLs
 * are dropped rather than widening the allowlist to something unintended.
 */
export const parseAllowedOrigins = (raw: string | undefined | null): string[] => {
  if (!raw) return []

  const origins: string[] = []

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    // Trailing or doubled separators are a formatting artefact, not a mistake
    // worth reporting.
    if (trimmed === '') continue

    const url = parseHttpUrl(trimmed)
    if (url === null) {
      warnDroppedEntry(trimmed, 'not an absolute http(s) URL')
      continue
    }

    const problem = hostnameProblem(url.hostname)
    if (problem !== null) {
      warnDroppedEntry(trimmed, problem)
      continue
    }

    origins.push(url.origin)
  }

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
