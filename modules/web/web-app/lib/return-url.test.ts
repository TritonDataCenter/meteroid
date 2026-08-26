import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAllowedOrigins, resolveReturnUrl, resolveSameOriginReturnUrl } from './return-url.ts'

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
    // The separator is not the cause here, and saying so would send an
    // operator after a fix that changes nothing.
    assert.doesNotMatch(warnings[0], /separated by commas, not/)
  })

  it('rejects a semicolon-separated list instead of keeping the run-together host', () => {
    // `;` is not a forbidden host code point, so this parses to the hostname
    // "a.example;https" and would otherwise sit in the allowlist matching
    // nothing -- the same failure the wildcard rule exists to prevent.
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('https://a.example;https://b.example')
    })
    assert.deepEqual(parsed, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /a\.example;https/)
    assert.match(warnings[0], /separated by commas, not ";"/)
    assert.doesNotMatch(warnings[0], /wildcard/)
  })

  it('keeps the host forms a developer machine actually serves from', () => {
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('http://localhost:3000,http://127.0.0.1:8080,http://[::1]:3000')
    })
    assert.deepEqual(parsed, [
      'http://localhost:3000',
      'http://127.0.0.1:8080',
      'http://[::1]:3000',
    ])
    assert.deepEqual(warnings, [])
  })

  it('warns about the JSON array form, which is not what this variable takes', () => {
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('["https://a.example"]')
    })
    assert.deepEqual(parsed, [])
    assert.equal(warnings.length, 1)
  })

  it('keeps a single-label host, with or without a port', () => {
    // One DNS label is a valid hostname on an internal network. Requiring a
    // dot would drop a working operator origin and manufacture the silent
    // empty allowlist this diagnostic exists to prevent.
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('http://intranet,http://billing:8080')
    })
    assert.deepEqual(parsed, ['http://intranet', 'http://billing:8080'])
    assert.deepEqual(warnings, [])
  })

  it('keeps a host containing an underscore', () => {
    // Not RFC 1123, but browsers resolve it and internal naming uses it.
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('https://my_host.example')
    })
    assert.deepEqual(parsed, ['https://my_host.example'])
    assert.deepEqual(warnings, [])
  })

  it('names the separator it found rather than assuming a semicolon', () => {
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('https://a.example&https://b.example')
    })
    assert.deepEqual(parsed, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /separated by commas, not "&"/)
    assert.doesNotMatch(warnings[0], /wildcard/)
  })

  it('suggests no cause at all when neither a wildcard nor a separator explains it', () => {
    // An empty label is malformed for a reason the diagnostic cannot name, so
    // it must not invent one.
    let parsed: string[] = []
    const warnings = captureWarnings(() => {
      parsed = parseAllowedOrigins('https://a..example')
    })
    assert.deepEqual(parsed, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /"a\.\.example" is not a valid hostname/)
    assert.doesNotMatch(warnings[0], /wildcard/)
    assert.doesNotMatch(warnings[0], /separated by commas, not/)
  })

  it('deduplicates entries that normalize to the same origin', () => {
    assert.deepEqual(parseAllowedOrigins('https://a.example,https://a.example:443/x'), [
      'https://a.example',
    ])
  })
})

describe('resolveSameOriginReturnUrl', () => {
  const ORIGIN = 'https://app.example.com'
  const resolve = (raw: string | undefined | null) => resolveSameOriginReturnUrl(raw, ORIGIN)

  it('refuses the backslash family, which resolves to a foreign host on our own origin', () => {
    // The confirmed exploit. Each of these keeps `ORIGIN` as its origin -- an
    // origin comparison passes -- while resolving to the pathname
    // `//evil.example`, which the browser re-reads as a protocol-relative URL.
    for (const payload of [
      String.raw`/.\/evil.example`,
      String.raw`/..\/evil.example`,
      String.raw`/.\\evil.example`,
      String.raw`/foo/..\/evil.example`,
    ]) {
      assert.equal(new URL(payload, ORIGIN).origin, ORIGIN, payload)
      assert.equal(new URL(payload, ORIGIN).pathname, '//evil.example', payload)
      assert.equal(resolve(payload), null, payload)
    }
  })

  it('refuses the same payloads arriving through the query string', () => {
    // How the payload is actually delivered: `?returnUrl=%2F.%5C%2Fevil.example`
    // is decoded once by `useSearchParams` before the form ever sees it.
    const returnUrl = new URLSearchParams('returnUrl=%2F.%5C%2Fevil.example').get('returnUrl')
    assert.equal(returnUrl, String.raw`/.\/evil.example`)
    assert.equal(resolve(returnUrl), null)
  })

  it('refuses percent-encoded dot segments that fold to the same pathname', () => {
    // `%2e` is a single-dot path segment to the parser, so encoding the dot
    // reaches `//evil.example` by the same route.
    assert.equal(resolve(String.raw`/%2e\/evil.example`), null)
    assert.equal(resolve(String.raw`/%2e%2e\/evil.example`), null)
  })

  it('refuses a bare authority, whose origin is not ours at all', () => {
    // These are refused by the origin comparison rather than the pathname
    // check: `encodeLocation` strips a real authority, so on their own they
    // were never the exploitable form. Testing only these would pass against
    // the old `startsWith('/')` code and report a fix that is not there.
    assert.equal(resolve('//evil.example'), null)
    assert.equal(resolve('///evil.example'), null)
    assert.equal(resolve(String.raw`/\evil.example`), null)
    assert.equal(resolve(String.raw`/\/evil.example`), null)
  })

  it('refuses a value whose whitespace is stripped into a foreign origin', () => {
    // The parser drops tabs before resolving, so a raw-string inspection sees
    // a path and the parser sees an authority.
    assert.equal(resolve('/\t/.\\/evil.example'), null)
  })

  it('refuses anything that is not an absolute-path reference', () => {
    assert.equal(resolve('https://evil.example/'), null)
    assert.equal(resolve('javascript:alert(1)'), null)
    assert.equal(resolve('data:text/html,<script>alert(1)</script>'), null)
    assert.equal(resolve(String.raw`\\evil.example`), null)
    assert.equal(resolve('dashboard'), null)
    assert.equal(resolve('../dashboard'), null)
    // Still percent-encoded, which is what a caller reading the raw query
    // string would hand over. Decoding it here would resurrect the payload.
    assert.equal(resolve('%2F.%5C%2Fevil.example'), null)
  })

  it('refuses an absent value', () => {
    assert.equal(resolve(null), null)
    assert.equal(resolve(undefined), null)
    assert.equal(resolve(''), null)
  })

  it('refuses everything when there is no usable origin to resolve against', () => {
    // An opaque origin serializes to "null" and is not a URL base, so there is
    // nothing to validate against and the answer is "do not redirect".
    assert.equal(resolveSameOriginReturnUrl('/dashboard', null), null)
  })

  it('accepts ordinary in-app paths', () => {
    assert.equal(resolve('/dashboard'), '/dashboard')
    assert.equal(resolve('/settings?tab=billing'), '/settings?tab=billing')
    assert.equal(resolve('/a/b#c'), '/a/b#c')
    assert.equal(resolve('/'), '/')
    assert.equal(
      resolve('/invite-authenticated?token=abc&next=/x'),
      '/invite-authenticated?token=abc&next=/x'
    )
  })

  it('normalizes a legitimate dot segment rather than refusing it', () => {
    assert.equal(resolve('/./dashboard'), '/dashboard')
    assert.equal(resolve('/foo/./bar'), '/foo/bar')
    assert.equal(resolve('/foo/../bar'), '/bar')
    // A dot inside a segment is just a character.
    assert.equal(resolve('/reports/2026.08.pdf'), '/reports/2026.08.pdf')
  })

  it('returns the parser path rather than the caller string', () => {
    // A single backslash folds to a separator and the `.` segment goes away,
    // leaving a genuine same-origin path -- but not the one that was typed, so
    // the caller must navigate to what was validated.
    assert.equal(resolve(String.raw`/.\evil.example`), '/evil.example')
  })

  it('accepts its own output unchanged', () => {
    // The value is handed to `navigate`, which resolves it again. A result that
    // did not survive a second pass would mean the browser sees something the
    // validator never looked at.
    for (const path of ['/dashboard', '/settings?tab=billing', '/a/b#c', '/foo/../bar']) {
      const once = resolve(path)
      assert.notEqual(once, null)
      assert.equal(resolve(once), once, path)
    }
  })
})
