import * as urlHelper from '../src/url-helper'

describe('getServerUrl tests', () => {
  it('basics', async () => {
    // Note that URL::toString will append a trailing / when passed just a domain name ...
    expect(urlHelper.getServerUrl().toString()).toBe('https://github.com/')
    expect(urlHelper.getServerUrl(' ').toString()).toBe('https://github.com/')
    expect(urlHelper.getServerUrl('   ').toString()).toBe('https://github.com/')
    expect(urlHelper.getServerUrl('http://contoso.com').toString()).toBe(
      'http://contoso.com/'
    )
    expect(urlHelper.getServerUrl('https://contoso.com').toString()).toBe(
      'https://contoso.com/'
    )
    expect(urlHelper.getServerUrl('https://contoso.com/').toString()).toBe(
      'https://contoso.com/'
    )

    // ... but can't make that same assumption when passed an URL that includes some deeper path.
    expect(urlHelper.getServerUrl('https://contoso.com/a/b').toString()).toBe(
      'https://contoso.com/a/b'
    )
  })
})

describe('isGhes tests', () => {
  it('basics', async () => {
    expect(urlHelper.isGhes()).toBeFalsy()
    expect(urlHelper.isGhes('https://github.com')).toBeFalsy()
    expect(urlHelper.isGhes('https://contoso.ghe.com')).toBeFalsy()
    expect(urlHelper.isGhes('https://test.github.localhost')).toBeFalsy()
    expect(urlHelper.isGhes('https://src.onpremise.fabrikam.com')).toBeTruthy()
  })
})

describe('getServerApiUrl tests', () => {
  it('basics', async () => {
    expect(urlHelper.getServerApiUrl()).toBe('https://api.github.com')
    expect(urlHelper.getServerApiUrl('https://github.com')).toBe(
      'https://api.github.com'
    )
    expect(urlHelper.getServerApiUrl('https://GitHub.com')).toBe(
      'https://api.github.com'
    )
    expect(urlHelper.getServerApiUrl('https://contoso.ghe.com')).toBe(
      'https://api.contoso.ghe.com'
    )
    expect(urlHelper.getServerApiUrl('https://fabrikam.GHE.COM')).toBe(
      'https://api.fabrikam.ghe.com'
    )
    expect(
      urlHelper.getServerApiUrl('https://src.onpremise.fabrikam.com')
    ).toBe('https://src.onpremise.fabrikam.com/api/v3')
  })
})
