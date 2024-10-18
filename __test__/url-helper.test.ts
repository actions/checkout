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
  const pristineEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {...pristineEnv}
  })

  afterAll(() => {
    process.env = pristineEnv
  })

  it('basics', async () => {
    delete process.env['GITHUB_SERVER_URL']
    expect(urlHelper.isGhes()).toBeFalsy()
    expect(urlHelper.isGhes('https://github.com')).toBeFalsy()
    expect(urlHelper.isGhes('https://contoso.ghe.com')).toBeFalsy()
    expect(urlHelper.isGhes('https://test.github.localhost')).toBeFalsy()
    expect(urlHelper.isGhes('https://src.onpremise.fabrikam.com')).toBeTruthy()
  })

  it('returns false when the GITHUB_SERVER_URL environment variable is not defined', async () => {
    delete process.env['GITHUB_SERVER_URL']
    expect(urlHelper.isGhes()).toBeFalsy()
  })

  it('returns false when the GITHUB_SERVER_URL environment variable is set to github.com', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://github.com'
    expect(urlHelper.isGhes()).toBeFalsy()
  })

  it('returns false when the GITHUB_SERVER_URL environment variable is set to a GitHub Enterprise Cloud-style URL', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://contoso.ghe.com'
    expect(urlHelper.isGhes()).toBeFalsy()
  })

  it('returns false when the GITHUB_SERVER_URL environment variable has a .localhost suffix', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://mock-github.localhost'
    expect(urlHelper.isGhes()).toBeFalsy()
  })

  it('returns true when the GITHUB_SERVER_URL environment variable is set to some other URL', async () => {
    process.env['GITHUB_SERVER_URL'] = 'https://src.onpremise.fabrikam.com'
    expect(urlHelper.isGhes()).toBeTruthy()
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
