import {jest, describe, it, expect, beforeEach} from '@jest/globals'

const mockInfo = jest.fn()
const mockCreateCommandManager = jest.fn<() => Promise<unknown>>()
const mockPrepareExistingDirectory = jest.fn()
const mockDownloadRepository = jest.fn()
const mockGetState = jest.fn(() => '')

jest.unstable_mockModule('@actions/core', () => ({
  info: mockInfo,
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  getState: mockGetState,
  saveState: jest.fn()
}))

jest.unstable_mockModule('@actions/io', () => ({
  mkdirP: jest.fn(),
  rmRF: jest.fn()
}))

jest.unstable_mockModule('../src/fs-helper.js', () => ({
  directoryExistsSync: jest.fn(() => false),
  fileExistsSync: jest.fn(() => false)
}))

jest.unstable_mockModule('../src/git-auth-helper.js', () => ({
  createAuthHelper: jest.fn()
}))

jest.unstable_mockModule('../src/git-command-manager.js', () => ({
  createCommandManager: mockCreateCommandManager,
  MinimumGitVersion: '2.18',
  MinimumGitSparseCheckoutVersion: '2.28'
}))

jest.unstable_mockModule('../src/git-directory-helper.js', () => ({
  prepareExistingDirectory: mockPrepareExistingDirectory
}))

jest.unstable_mockModule('../src/github-api-helper.js', () => ({
  downloadRepository: mockDownloadRepository
}))

jest.unstable_mockModule('../src/url-helper.js', () => ({
  getFetchUrl: jest.fn(() => 'https://github.com/owner/repo.git'),
  getServerApiUrl: jest.fn(() => 'https://api.github.com'),
  getServerUrl: jest.fn(() => new URL('https://github.com')),
  isGhes: jest.fn(() => false)
}))

const gitSourceProvider = await import('../src/git-source-provider.js')
type IGitSourceSettings =
  import('../src/git-source-settings.js').IGitSourceSettings

describe('git source provider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateCommandManager.mockRejectedValue(
      new Error(
        "Minimum Git version required for sparse checkout is 2.28. Your git ('/usr/bin/git') is 2.23"
      )
    )
  })

  it('reports why it falls back to the REST API when Git initialization fails', async () => {
    const settings: IGitSourceSettings = {
      repositoryPath: '/tmp/checkout',
      repositoryOwner: 'owner',
      repositoryName: 'repo',
      ref: 'refs/heads/main',
      commit: '1234567890',
      clean: true,
      filter: undefined,
      sparseCheckout: ['src'],
      sparseCheckoutConeMode: true,
      fetchDepth: 1,
      fetchTags: false,
      showProgress: true,
      lfs: false,
      submodules: false,
      nestedSubmodules: false,
      authToken: 'token',
      sshKey: '',
      sshKnownHosts: '',
      sshStrict: true,
      sshUser: 'git',
      persistCredentials: true,
      workflowOrganizationId: undefined,
      setSafeDirectory: true,
      githubServerUrl: 'https://github.com',
      allowUnsafePrCheckout: false
    }

    await gitSourceProvider.getSource(settings)

    expect(mockInfo).toHaveBeenCalledWith(
      "Failed to initialize CommandManager: Minimum Git version required for sparse checkout is 2.28. Your git ('/usr/bin/git') is 2.23"
    )
    expect(mockDownloadRepository).toHaveBeenCalled()
  })
})
