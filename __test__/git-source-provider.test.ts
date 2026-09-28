import {jest, describe, it, expect, beforeEach} from '@jest/globals'

// Mock @actions/core before loading git-source-provider
const mockSetOutput = jest.fn()
jest.unstable_mockModule('@actions/core', () => ({
  setOutput: mockSetOutput,
  setSecret: jest.fn(),
  setFailed: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn()
}))

jest.unstable_mockModule('@actions/io', () => ({
  cp: jest.fn(),
  mkdirP: jest.fn(),
  mv: jest.fn(),
  rmRF: jest.fn(),
  which: jest.fn()
}))

jest.unstable_mockModule('../src/fs-helper.js', () => ({
  directoryExistsSync: jest.fn(() => true),
  existsSync: jest.fn(() => true),
  fileExistsSync: jest.fn(() => false)
}))

const mockCreateCommandManager = jest.fn()
jest.unstable_mockModule('../src/git-command-manager.js', () => ({
  createCommandManager: mockCreateCommandManager,
  MinimumGitVersion: '2.18',
  MinimumGitSparseCheckoutVersion: '2.28'
}))

// downloadRepository returns the commit it downloaded: the one requested, or the one the ref resolved to.
const resolvedCommitSha = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd'
const mockDownloadRepository = jest.fn(
  async (...args: any[]) => (args[4] as string) || resolvedCommitSha
)
jest.unstable_mockModule('../src/github-api-helper.js', () => ({
  downloadRepository: mockDownloadRepository,
  getDefaultBranch: jest.fn(async () => 'refs/heads/main'),
  tryGetRepositoryObjectFormat: jest.fn(async () => ({
    format: 'sha1',
    succeeded: true
  }))
}))

const mockCreateAuthHelper = jest.fn(() => ({
  configureAuth: jest.fn(),
  configureGlobalAuth: jest.fn(),
  configureSubmoduleAuth: jest.fn(),
  configureTempGlobalConfig: jest.fn(),
  removeAuth: jest.fn(),
  removeGlobalAuth: jest.fn(),
  removeGlobalConfig: jest.fn()
}))
jest.unstable_mockModule('../src/git-auth-helper.js', () => ({
  createAuthHelper: mockCreateAuthHelper
}))

jest.unstable_mockModule('../src/git-directory-helper.js', () => ({
  prepareExistingDirectory: jest.fn()
}))

jest.unstable_mockModule('../src/ref-helper.js', () => ({
  checkCommitInfo: jest.fn(),
  getCheckoutInfo: jest.fn(async () => ({
    ref: 'main',
    startPoint: 'refs/remotes/origin/main'
  })),
  getRefSpec: jest.fn(() => ['+refs/heads/main:refs/remotes/origin/main']),
  getRefSpecForAllHistory: jest.fn(() => [
    '+refs/heads/main*:refs/remotes/origin/main*'
  ]),
  testRef: jest.fn(async () => true)
}))

jest.unstable_mockModule('../src/state-helper.js', () => ({
  setRepositoryPath: jest.fn(),
  setSafeDirectory: jest.fn(),
  IsPost: false,
  PostSetSafeDirectory: false,
  RepositoryPath: ''
}))

// Dynamic imports after mocking
const gitSourceProvider = await import('../src/git-source-provider.js')
type IGitSourceSettings =
  import('../src/git-source-settings.js').IGitSourceSettings

const commitSha = '1234567890123456789012345678901234567890'
const commitSha256 =
  '1234567890123456789012345678901234567890123456789012345678901234'

function getSettings(): IGitSourceSettings {
  return {
    allowUnsafePrCheckout: false,
    authToken: 'token',
    clean: true,
    commit: commitSha,
    fetchDepth: 1,
    fetchTags: false,
    filter: undefined,
    githubServerUrl: undefined,
    lfs: false,
    nestedSubmodules: false,
    persistCredentials: true,
    ref: 'refs/heads/main',
    repositoryName: 'my-repo',
    repositoryOwner: 'my-org',
    repositoryPath: '/home/runner/work/my-repo/my-repo',
    setSafeDirectory: false,
    showProgress: false,
    // Matches getInputs(), which leaves sparseCheckout undefined when the input is empty
    sparseCheckout: undefined,
    sparseCheckoutConeMode: true,
    sshKey: '',
    sshKnownHosts: '',
    sshStrict: true,
    sshUser: '',
    submodules: false,
    workflowOrganizationId: undefined
  } as unknown as IGitSourceSettings
}

// A minimal git command manager, for the cases that do not fall back to the REST API.
function getGitCommandManager(): any {
  return {
    checkout: jest.fn(),
    config: jest.fn(),
    disableSparseCheckout: jest.fn(),
    init: jest.fn(),
    log1: jest.fn(async (format?: string) =>
      format ? `${commitSha}\n` : `commit ${commitSha}\n`
    ),
    remoteAdd: jest.fn(),
    fetch: jest.fn(),
    tryDisableAutomaticGarbageCollection: jest.fn(async () => true),
    version: jest.fn(async () => ({checkMinimum: () => false}))
  }
}

describe('git-source-provider tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sets the commit output when downloading using the REST API', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    const settings = getSettings()

    // Act
    await gitSourceProvider.getSource(settings)

    // Assert
    expect(mockDownloadRepository).toHaveBeenCalled()
    expect(mockSetOutput).toHaveBeenCalledWith('commit', commitSha)
  })

  it('sets the commit output to the resolved commit when downloading using the REST API without a commit', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    const settings = getSettings()
    settings.commit = ''

    // Act
    await gitSourceProvider.getSource(settings)

    // Assert
    expect(mockDownloadRepository).toHaveBeenCalled()
    expect(mockSetOutput).toHaveBeenCalledWith('commit', resolvedCommitSha)
  })

  it('sets the commit output to the resolved commit when downloading a ref that is not a SHA', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    const settings = getSettings()
    // getInputs() leaves commit undefined when a non-SHA ref is given for another repository
    settings.commit = undefined as unknown as string

    // Act
    await gitSourceProvider.getSource(settings)

    // Assert
    expect(mockDownloadRepository).toHaveBeenCalled()
    expect(mockSetOutput).toHaveBeenCalledWith('commit', resolvedCommitSha)
  })

  it('sets the commit output when downloading a SHA-256 object format repository', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    const settings = getSettings()
    // getInputs() accepts a 64 hex character ref as a commit, for sha256 repositories
    settings.commit = commitSha256

    // Act
    await gitSourceProvider.getSource(settings)

    // Assert
    expect(mockDownloadRepository).toHaveBeenCalledWith(
      settings.authToken,
      settings.repositoryOwner,
      settings.repositoryName,
      settings.ref,
      commitSha256,
      settings.repositoryPath,
      settings.githubServerUrl
    )
    expect(mockSetOutput).toHaveBeenCalledWith('commit', commitSha256)
  })

  it('sets the commit output after the repository has been downloaded', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    const settings = getSettings()

    // Act
    await gitSourceProvider.getSource(settings)

    // Assert
    expect(mockSetOutput).toHaveBeenCalledWith('commit', commitSha)
    expect(mockSetOutput.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockDownloadRepository.mock.invocationCallOrder[0]
    )
  })

  it('does not set the commit output when the REST API download fails (control)', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    mockDownloadRepository.mockImplementation(async () => {
      throw new Error('Download failed')
    })
    const settings = getSettings()

    // Act
    await expect(gitSourceProvider.getSource(settings)).rejects.toThrow(
      'Download failed'
    )

    // Assert
    expect(mockSetOutput).not.toHaveBeenCalledWith(
      'commit',
      expect.anything() as unknown as string
    )
    mockDownloadRepository.mockReset()
  })

  it('does not download or set the commit output when an input is not supported by the REST API fallback (control)', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    const submoduleSettings = getSettings()
    submoduleSettings.submodules = true
    const sshKeySettings = getSettings()
    sshKeySettings.sshKey = 'ssh-key'

    // Act
    await expect(
      gitSourceProvider.getSource(submoduleSettings)
    ).rejects.toThrow(`Input 'submodules' not supported`)
    await expect(gitSourceProvider.getSource(sshKeySettings)).rejects.toThrow(
      `Input 'ssh-key' not supported`
    )

    // Assert
    expect(mockDownloadRepository).not.toHaveBeenCalled()
    expect(mockSetOutput).not.toHaveBeenCalledWith(
      'commit',
      expect.anything() as unknown as string
    )
  })

  it('sets the commit output from git when git is available (control)', async () => {
    // Arrange
    const git = getGitCommandManager()
    mockCreateCommandManager.mockImplementation(async () => git)
    const settings = getSettings()

    // Act
    await gitSourceProvider.getSource(settings)

    // Assert
    expect(mockDownloadRepository).not.toHaveBeenCalled()
    expect(git.checkout).toHaveBeenCalled()
    expect(mockSetOutput).toHaveBeenCalledWith('commit', commitSha)
  })

  it('does not configure auth on the REST API fallback path (control)', async () => {
    // Arrange
    mockCreateCommandManager.mockImplementation(async () => {
      throw new Error('Git is not installed')
    })
    const settings = getSettings()

    // Act
    await gitSourceProvider.getSource(settings)

    // Assert: the fallback returns with authHelper still null, so the finally
    // block removes nothing. The added setOutput call does not change that.
    expect(mockCreateAuthHelper).not.toHaveBeenCalled()
  })
})
