import * as urlHelper from '../src/url-helper'

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
