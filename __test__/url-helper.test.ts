import * as urlHelper from '../lib/url-helper'

import { IGitSourceSettings } from '../lib/git-source-settings';

function getSettings(u: string): IGitSourceSettings {
  return {
    githubServerUrl: u,
    repositoryPath: '',
    repositoryOwner: 'some-owner',
    repositoryName: 'some-name',
    ref: '', commit: '', clean: false, filter: undefined,
    sparseCheckout: [], sparseCheckoutConeMode: false,
    fetchDepth: 0, fetchTags: false, showProgress: false,
    lfs: false, submodules: false, nestedSubmodules: false,
    authToken: '', sshKey: '', sshKnownHosts: '', sshStrict: false,
    persistCredentials: false, workflowOrganizationId: undefined,
    setSafeDirectory: false
  }
}
describe('url-helper tests', () => {
  it('getFetchUrl works on GitHub repos', async () => {
    expect(urlHelper.getFetchUrl(getSettings('https://github.com'))).toBe(
      "https://github.com/some-owner/some-name"
    )
  })

  it('getFetchUrl works on 3rd party repos with sub-path', async () => {
    expect(urlHelper.getFetchUrl(getSettings('https://other.com/subpath'))).toBe(
      'https://other.com/subpath/some-owner/some-name'
    )
  })

  it('getFetchUrl works on 3rd party repos with ssh keys', async () => {
    expect(urlHelper.getFetchUrl(getSettings('https://other.com/subpath'))).toBe(
      'https://other.com/subpath/some-owner/some-name'
    )
  })

  it('getFetchUrl works with ssh credentials', async () => {
    let settings = getSettings('https://other.com/subpath');
    settings.sshKey = 'not-empty'
    expect(urlHelper.getFetchUrl(settings)).toBe(
      'git@other.com:some-owner/some-name.git'
    )
  })
})
