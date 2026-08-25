import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAllowedOrigins, resolveReturnUrl } from './return-url.ts'

const ALLOWED = ['https://portal.example.com']

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

  it('refuses a userinfo prefix that only looks like the allowed host', () => {
    assert.equal(resolveReturnUrl('https://portal.example.com@evil.com/', ALLOWED), null)
  })

  it('refuses script and data schemes', () => {
    assert.equal(resolveReturnUrl('javascript:alert(1)', ALLOWED), null)
    assert.equal(resolveReturnUrl('data:text/html,<script>alert(1)</script>', ALLOWED), null)
  })

  it('does not let an opaque origin in the allowlist match an opaque target', () => {
    // Both sides serialize their origin as the literal string "null", so a
    // scheme check rather than an origin check has to reject these.
    assert.equal(resolveReturnUrl('javascript:alert(1)', ['data:text/plain,x']), null)
  })

  it('matches regardless of scheme and host casing', () => {
    assert.equal(
      resolveReturnUrl('HTTPS://PORTAL.EXAMPLE.COM/Thanks', ALLOWED),
      'https://portal.example.com/Thanks'
    )
  })

  it('treats a differing port as a differing origin', () => {
    assert.equal(resolveReturnUrl('https://portal.example.com:8443/', ALLOWED), null)
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
    assert.deepEqual(parseAllowedOrigins('  ,  '), [])
  })

  it('drops entries that are not absolute http(s) URLs', () => {
    assert.deepEqual(parseAllowedOrigins('portal.example.com,javascript:alert(1)'), [])
  })

  it('deduplicates entries that normalize to the same origin', () => {
    assert.deepEqual(parseAllowedOrigins('https://a.example,https://a.example:443/x'), [
      'https://a.example',
    ])
  })
})
