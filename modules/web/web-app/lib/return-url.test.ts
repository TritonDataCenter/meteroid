import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAllowedOrigins, resolveReturnUrl } from './return-url.ts'

const ALLOWED = ['https://portal.example.com']

/** Runs `fn` with `console.warn` captured, so diagnostics can be asserted. */
const captureWarnings = (fn: () => void): string[] => {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(' '))
  }
  try {
    fn()
  } finally {
    console.warn = original
  }
  return warnings
}

describe('resolveReturnUrl', () => {
  it('accepts an allowlisted origin', () => {
    assert.equal(
      resolveReturnUrl('https://portal.example.com/thanks', ALLOWED),
      'https://portal.example.com/thanks'
    )
  })

  it('refuses an origin that is not on the allowlist', () => {
    assert.equal(resolveReturnUrl('https://evil.example', ALLOWED), null)
  })

  it('refuses a lookalike host that merely has the allowed origin as a prefix', () => {
    assert.equal(resolveReturnUrl('https://portal.example.com.evil.com/', ALLOWED), null)
  })

  it('refuses a subdomain of the allowed host', () => {
    assert.equal(resolveReturnUrl('https://evil.portal.example.com/', ALLOWED), null)
  })

  it('refuses a host that only shares a prefix with the allowed host', () => {
    assert.equal(resolveReturnUrl('https://evil-portal.example.com/', ALLOWED), null)
  })

  it('refuses a trailing-dot form of the allowed host', () => {
    // The root-label form is a distinct origin to the URL parser, so it does
    // not match; pinned because it is a classic allowlist bypass.
    assert.equal(resolveReturnUrl('https://portal.example.com./', ALLOWED), null)
  })

  it('refuses a value that cannot be parsed as a URL', () => {
    assert.equal(resolveReturnUrl('not a url', ALLOWED), null)
  })

  it('refuses an absent value', () => {
    assert.equal(resolveReturnUrl(null, ALLOWED), null)
    assert.equal(resolveReturnUrl(undefined, ALLOWED), null)
    assert.equal(resolveReturnUrl('', ALLOWED), null)
  })

  it('refuses everything when the allowlist is empty', () => {
    assert.equal(resolveReturnUrl('https://portal.example.com/thanks', []), null)
  })

  it('refuses a relative path, which has no origin to compare', () => {
    assert.equal(resolveReturnUrl('/thanks', ALLOWED), null)
  })

  it('refuses a protocol-relative value rather than resolving it', () => {
    // These are refused only because `new URL()` is called with no base
    // argument, and only the allowed-host forms can say so: an off-allowlist
    // host is refused either way, so it pins nothing. With a base these two
    // resolve to https://portal.example.com/x and pass the allowlist check.
    assert.equal(resolveReturnUrl('//portal.example.com/x', ALLOWED), null)
    assert.equal(resolveReturnUrl(String.raw`/\portal.example.com/x`, ALLOWED), null)

    assert.equal(resolveReturnUrl('//evil.example', ALLOWED), null)
    assert.equal(resolveReturnUrl('///evil.example', ALLOWED), null)
  })

  it('refuses backslash forms that a lenient parser would read as the allowed host', () => {
    assert.equal(resolveReturnUrl(String.raw`https:\\evil.example`, ALLOWED), null)
    assert.equal(resolveReturnUrl(String.raw`https:/\evil.example`, ALLOWED), null)
  })

  it('sends a backslash-at form to the allowed host as a path, not to the trailing host', () => {
    // WHATWG folds the backslash to a slash, so the authority ends before the
    // `@`: this really is a path on the allowed host, and the canonical value
    // handed back says so unambiguously.
    assert.equal(
      resolveReturnUrl(String.raw`https://portal.example.com\@evil.example`, ALLOWED),
      'https://portal.example.com/@evil.example'
    )
  })

  it('refuses a userinfo prefix that only looks like the allowed host', () => {
    assert.equal(resolveReturnUrl('https://portal.example.com@evil.com/', ALLOWED), null)
  })

  it('strips embedded credentials from an otherwise allowed target', () => {
    // Userinfo is not part of the origin, so it survives the allowlist check.
    // Left in place it forces an Authorization header at the portal and makes
    // the link preview read as another domain.
    assert.equal(
      resolveReturnUrl('https://attacker:pw@portal.example.com/', ALLOWED),
      'https://portal.example.com/'
    )
    assert.equal(
      resolveReturnUrl('https://evil.example%2F@portal.example.com/', ALLOWED),
      'https://portal.example.com/'
    )
  })

  it('refuses script and data schemes', () => {
    assert.equal(resolveReturnUrl('javascript:alert(1)', ALLOWED), null)
    assert.equal(resolveReturnUrl('data:text/html,<script>alert(1)</script>', ALLOWED), null)
    assert.equal(resolveReturnUrl('vbscript:msgbox(1)', ALLOWED), null)
  })

  it('refuses local and wrapper schemes', () => {
    assert.equal(resolveReturnUrl('file:///etc/passwd', ALLOWED), null)
    assert.equal(
      resolveReturnUrl('filesystem:https://portal.example.com/temporary/x', ALLOWED),
      null
    )
    assert.equal(resolveReturnUrl('view-source:https://portal.example.com/', ALLOWED), null)
  })

  it('refuses a blob: URL whose inner origin is the allowed origin', () => {
    // blob: inherits the inner URL's origin, so an origin-only check would let
    // this through with no opaque-origin coincidence to save it. Only the
    // scheme gate stops it.
    assert.equal(new URL('blob:https://portal.example.com/1').origin, ALLOWED[0])
    assert.equal(resolveReturnUrl('blob:https://portal.example.com/1', ALLOWED), null)
  })

  it('does not let an opaque origin in the allowlist match an opaque target', () => {
    // Both sides serialize their origin as the literal string "null", so a
    // scheme check rather than an origin check has to reject these.
    assert.equal(resolveReturnUrl('javascript:alert(1)', ['data:text/plain,x']), null)
  })

  it('refuses a scheme downgrade against an https allowlist entry', () => {
    assert.equal(resolveReturnUrl('http://portal.example.com/', ALLOWED), null)
  })

  it('matches regardless of scheme and host casing', () => {
    assert.equal(
      resolveReturnUrl('HTTPS://PORTAL.EXAMPLE.COM/Thanks', ALLOWED),
      'https://portal.example.com/Thanks'
    )
  })

  it('accepts a unicode host that normalizes to the allowed host', () => {
    // The ideographic full stop is a label separator to the URL parser.
    assert.equal(
      resolveReturnUrl('https://portal.example。com/thanks', ALLOWED),
      'https://portal.example.com/thanks'
    )
  })

  it('refuses a unicode host that normalizes to a different host', () => {
    assert.equal(resolveReturnUrl('https://portal.example.com。evil.com/', ALLOWED), null)
  })

  it('treats a differing port as a differing origin', () => {
    assert.equal(resolveReturnUrl('https://portal.example.com:8443/', ALLOWED), null)
  })

  it('returns the canonical serialization rather than the caller string', () => {
    // Handing back the raw input would leave room for the browser to read it
    // differently to the validator.
    const raw = 'https://PORTAL.example.com:443/a%2Fb?q=1#f'
    assert.equal(resolveReturnUrl(raw, ALLOWED), 'https://portal.example.com/a%2Fb?q=1#f')
    assert.notEqual(resolveReturnUrl(raw, ALLOWED), raw)
  })
})

describe('parseAllowedOrigins', () => {
  it('parses a comma-separated list down to bare origins', () => {
    assert.deepEqual(parseAllowedOrigins('https://a.example/ignored/path, https://b.example'), [
      'https://a.example',
      'https://b.example',
    ])
  })

  it('defaults to deny-all when unset or empty', () => {
    assert.deepEqual(parseAllowedOrigins(undefined), [])
    assert.deepEqual(parseAllowedOrigins(''), [])

    // A trailing or doubled comma is a formatting artefact, not a mistake.
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('  ,  ')
    })
    assert.deepEqual(parsed, [])
    assert.deepEqual(warnings, [])
  })

  it('names each entry it drops for not being an absolute http(s) URL', () => {
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('portal.example.com,javascript:alert(1)')
    })
    assert.deepEqual(parsed, [])
    assert.equal(warnings.length, 2)
    assert.match(warnings[0], /"portal\.example\.com"/)
    assert.match(warnings[1], /"javascript:alert\(1\)"/)
  })

  it('rejects a wildcard host instead of keeping a literal that matches nothing', () => {
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('https://*.example.com')
    })
    assert.deepEqual(parsed, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /wildcard/)
  })

  it('warns about the JSON array form, which is not what this variable takes', () => {
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('["https://a.example"]')
    })
    assert.deepEqual(parsed, [])
    assert.equal(warnings.length, 1)
  })

  it('deduplicates entries that normalize to the same origin', () => {
    assert.deepEqual(parseAllowedOrigins('https://a.example,https://a.example:443/x'), [
      'https://a.example',
    ])
  })
})
