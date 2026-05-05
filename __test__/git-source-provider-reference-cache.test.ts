import * as path from 'path'

const mockStartGroup = jest.fn()
const mockEndGroup = jest.fn()
const mockInfo = jest.fn()
const mockWarning = jest.fn()
const mockSetOutput = jest.fn()
const mockSetSecret = jest.fn()

const mockCreateCommandManager = jest.fn()
const mockCreateAuthHelper = jest.fn()
const mockPrepareExistingDirectory = jest.fn()
const mockGetFetchUrl = jest.fn()
const mockGetRefSpec = jest.fn()
const mockTestRef = jest.fn()
const mockGetCheckoutInfo = jest.fn()
const mockCheckCommitInfo = jest.fn()
const mockSetRepositoryPath = jest.fn()
const mockSetupCache = jest.fn()
const mockDirectoryExistsSync = jest.fn()
const mockFileExistsSync = jest.fn()

jest.mock('@actions/core', () => ({
  startGroup: mockStartGroup,
  endGroup: mockEndGroup,
  info: mockInfo,
  warning: mockWarning,
  setOutput: mockSetOutput,
  setSecret: mockSetSecret
}))

jest.mock('@actions/io', () => ({
  rmRF: jest.fn(),
  mkdirP: jest.fn()
}))

jest.mock('../src/fs-helper', () => ({
  directoryExistsSync: mockDirectoryExistsSync,
  fileExistsSync: mockFileExistsSync
}))

jest.mock('../src/git-command-manager', () => ({
  MinimumGitSparseCheckoutVersion: {},
  createCommandManager: mockCreateCommandManager
}))

jest.mock('../src/git-auth-helper', () => ({
  createAuthHelper: mockCreateAuthHelper
}))

jest.mock('../src/git-directory-helper', () => ({
  prepareExistingDirectory: mockPrepareExistingDirectory
}))

jest.mock('../src/github-api-helper', () => ({
  downloadRepository: jest.fn(),
  getDefaultBranch: jest.fn()
}))

jest.mock('../src/ref-helper', () => ({
  getRefSpec: mockGetRefSpec,
  getCheckoutInfo: mockGetCheckoutInfo,
  testRef: mockTestRef,
  checkCommitInfo: mockCheckCommitInfo
}))

jest.mock('../src/state-helper', () => ({
  setRepositoryPath: mockSetRepositoryPath
}))

jest.mock('../src/url-helper', () => ({
  getFetchUrl: mockGetFetchUrl
}))

jest.mock('../src/git-cache-helper', () => ({
  GitCacheHelper: jest.fn().mockImplementation(() => ({
    setupCache: mockSetupCache
  }))
}))

import {getSource} from '../src/git-source-provider'

describe('getSource reference cache regression', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('updates the reference cache and reconfigures alternates for existing repositories', async () => {
    const repositoryPath = '/tmp/work/repo'
    const repositoryUrl = 'https://github.com/actions/checkout'
    const cachePath = '/tmp/reference-cache/actions-checkout.git'

    const mockGit = {
      init: jest.fn(),
      remoteAdd: jest.fn(),
      referenceAdd: jest.fn().mockResolvedValue(undefined),
      tryDisableAutomaticGarbageCollection: jest.fn().mockResolvedValue(true),
      fetch: jest.fn().mockResolvedValue(undefined),
      version: jest.fn().mockResolvedValue({
        checkMinimum: jest.fn().mockReturnValue(true)
      }),
      disableSparseCheckout: jest.fn().mockResolvedValue(undefined),
      checkout: jest.fn().mockResolvedValue(undefined),
      log1: jest
        .fn()
        .mockResolvedValueOnce('commit info')
        .mockResolvedValueOnce('0123456789abcdef'),
      lfsInstall: jest.fn(),
      submoduleSync: jest.fn(),
      submoduleUpdate: jest.fn(),
      submoduleForeach: jest.fn(),
      config: jest.fn()
    }

    const mockAuthHelper = {
      configureAuth: jest.fn().mockResolvedValue(undefined),
      configureGlobalAuth: jest.fn().mockResolvedValue(undefined),
      configureSubmoduleAuth: jest.fn().mockResolvedValue(undefined),
      configureTempGlobalConfig: jest.fn().mockResolvedValue('/tmp/gitconfig'),
      removeAuth: jest.fn().mockResolvedValue(undefined),
      removeGlobalAuth: jest.fn().mockResolvedValue(undefined),
      removeGlobalConfig: jest.fn().mockResolvedValue(undefined)
    }

    mockCreateCommandManager.mockResolvedValue(mockGit)
    mockCreateAuthHelper.mockReturnValue(mockAuthHelper)
    mockPrepareExistingDirectory.mockResolvedValue(undefined)
    mockGetFetchUrl.mockReturnValue(repositoryUrl)
    mockGetRefSpec.mockReturnValue(['+refs/heads/main:refs/remotes/origin/main'])
    mockTestRef.mockResolvedValue(true)
    mockGetCheckoutInfo.mockResolvedValue({
      ref: 'refs/heads/main',
      startPoint: 'refs/remotes/origin/main'
    })
    mockCheckCommitInfo.mockResolvedValue(undefined)
    mockSetupCache.mockResolvedValue(cachePath)
    mockFileExistsSync.mockReturnValue(false)
    mockDirectoryExistsSync.mockImplementation((targetPath: string) => {
      return (
        targetPath === repositoryPath ||
        targetPath === path.join(repositoryPath, '.git') ||
        targetPath === path.join(cachePath, 'objects')
      )
    })

    await getSource({
      repositoryPath,
      repositoryOwner: 'actions',
      repositoryName: 'checkout',
      ref: 'refs/heads/main',
      commit: '0123456789abcdef',
      clean: false,
      filter: undefined,
      sparseCheckout: undefined as any,
      sparseCheckoutConeMode: false,
      fetchDepth: 1,
      fetchDepthExplicit: true,
      fetchTags: false,
      showProgress: false,
      referenceCache: '/tmp/reference-cache',
      lfs: false,
      submodules: false,
      nestedSubmodules: false,
      authToken: 'token',
      sshKey: '',
      sshKnownHosts: '',
      sshStrict: true,
      sshUser: 'git',
      persistCredentials: false,
      workflowOrganizationId: undefined,
      githubServerUrl: 'https://github.com',
      setSafeDirectory: false
    } as any)

    expect(mockGit.init).not.toHaveBeenCalled()
    expect(mockGit.remoteAdd).not.toHaveBeenCalled()
    expect(mockSetupCache).toHaveBeenCalledWith(mockGit, repositoryUrl)
    expect(mockGit.referenceAdd).toHaveBeenCalledWith(
      path.join(cachePath, 'objects')
    )
  })
})
