import * as urlHelper from '../src/url-helper'

describe('isGhes tests', () => {
  it('basics', async () => {
    expect(urlHelper.isGhes()).toBeFalsy()
    expect(urlHelper.isGhes('https://github.com')).toBeFalsy()
    //expect(urlHelper.isGhes('https://api.github.com')).toBeFalsy()
    expect(urlHelper.isGhes('https://europe.ghe.com')).toBeFalsy()
    expect(urlHelper.isGhes('https://test.github.localhost')).toBeFalsy()
    expect(urlHelper.isGhes('https://src.onpremise.customer.com')).toBeTruthy()
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
    expect(urlHelper.getServerApiUrl('https://europe.ghe.com')).toBe(
      'https://api.europe.ghe.com'
    )
    expect(urlHelper.getServerApiUrl('https://australia.GHE.COM')).toBe(
      'https://api.australia.ghe.com'
    )
    expect(
      urlHelper.getServerApiUrl('https://src.onpremise.customer.com')
    ).toBe('https://src.onpremise.customer.com/api/v3')
  })
})
