import {describe, it, expect} from '@jest/globals'
import {escapeSingleQuote} from '../src/shell-escape.js'

describe('shell-escape tests', () => {
  it('handles empty string', () => {
    expect(escapeSingleQuote('')).toBe('')
  })

  it('leaves strings without single quotes unchanged', () => {
    expect(escapeSingleQuote('https://github.com')).toBe('https://github.com')
    expect(escapeSingleQuote('git@github.com:')).toBe('git@github.com:')
    expect(escapeSingleQuote('core.sshCommand')).toBe('core.sshCommand')
    expect(escapeSingleQuote('http.https://github.com/.extraheader')).toBe(
      'http.https://github.com/.extraheader'
    )
  })

  it('escapes single quotes with POSIX close-escape-reopen sequence', () => {
    expect(escapeSingleQuote("it's")).toBe("it'\\''s")
    expect(escapeSingleQuote("'foo'")).toBe("'\\''foo'\\''")
    expect(escapeSingleQuote("a'b'c")).toBe("a'\\''b'\\''c")
  })

  it('escapes single quotes in URLs with decoded percent-encoded characters', () => {
    // new URL('https://evil%27$(id)host.com') results in hostname "evil'$(id)host.com"
    const decodedUrlKey = "http.https://evil'$(id)host.com/.extraheader"
    expect(escapeSingleQuote(decodedUrlKey)).toBe(
      "http.https://evil'\\''$(id)host.com/.extraheader"
    )

    const decodedInsteadOfValue = "git@evil'$(id)host.com:"
    expect(escapeSingleQuote(decodedInsteadOfValue)).toBe(
      "git@evil'\\''$(id)host.com:"
    )
  })

  it('preserves other shell special characters literally inside single quotes', () => {
    const specialChars = '`$(id) && rm -rf /; echo "hello" \\ * ? < > |'
    expect(escapeSingleQuote(specialChars)).toBe(
      '`$(id) && rm -rf /; echo "hello" \\ * ? < > |'
    )
  })
})
