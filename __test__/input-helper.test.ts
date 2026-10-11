import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll
} from '@jest/globals'
import * as path from 'path'

const originalGitHubWorkspace = process.env['GITHUB_WORKSPACE']
const gitHubWorkspace = path.resolve('/checkout-tests/workspace')

// Inputs for mock @actions/core
let inputs = {} as any

// Mutable mock github context
const mockGithubContext: any = {
  ref: 'refs/heads/some-ref',
  sha: '1234567890123456789012345678901234567890',
  repo: {owner: 'some-owner', repo: 'some-repo'},
  eventName: '',
  payload: {}
}

// Replicate @actions/core getInput behavior: it trims whitespace by default
// (String.prototype.trim(), which strips characters such as a leading U+FEFF BOM)
// unless trimWhitespace is explicitly set to false.
const getInputImpl = (name: string, options?: {trimWhitespace?: boolean}) => {
  const val = inputs[name] ?? ''
  if (options && options.trimWhitespace === false) {
    return val
  }
  return typeof val === 'string' ? val.trim() : val
}

// Mock @actions/core before loading input-helper
jest.unstable_mockModule('@actions/core', () => ({
  getInput: jest.fn(getInputImpl),
  getBooleanInput: jest.fn((name: string) => inputs[name]),
  getMultilineInput: jest.fn((name: string) =>
    inputs[name] ? String(inputs[name]).split('\n').filter(Boolean) : []
  ),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  setSecret: jest.fn()
}))

// Mock @actions/github before loading input-helper
jest.unstable_mockModule('@actions/github', () => ({
  context: mockGithubContext,
  getOctokit: jest.fn()
}))

// Mock fs-helper
const mockDirectoryExistsSync = jest.fn((p: string) => p === gitHubWorkspace)
jest.unstable_mockModule('../src/fs-helper.js', () => ({
  directoryExistsSync: mockDirectoryExistsSync,
  fileExistsSync: jest.fn()
}))

// Mock workflow-context-helper
const mockGetOrganizationId = jest.fn(async () => 123456)
jest.unstable_mockModule('../src/workflow-context-helper.js', () => ({
  getOrganizationId: mockGetOrganizationId
}))

// Dynamic imports after mocking
const core = await import('@actions/core')
const inputHelper = await import('../src/input-helper.js')
type IGitSourceSettings =
  import('../src/git-source-settings.js').IGitSourceSettings

describe('input-helper tests', () => {
  beforeAll(() => {
    // GitHub workspace
    process.env['GITHUB_WORKSPACE'] = gitHubWorkspace
  })

  beforeEach(() => {
    // Reset inputs
    inputs = {}
    jest.clearAllMocks()
    // Re-apply default mocks
    ;(core.getInput as jest.Mock<any>).mockImplementation(getInputImpl as any)
    mockDirectoryExistsSync.mockImplementation(
      (p: string) => p === gitHubWorkspace
    )
    mockGetOrganizationId.mockResolvedValue(123456)
  })

  afterAll(() => {
    // Restore GitHub workspace
    delete process.env['GITHUB_WORKSPACE']
    if (originalGitHubWorkspace) {
      process.env['GITHUB_WORKSPACE'] = originalGitHubWorkspace
    }

    // Restore @actions/github context
    mockGithubContext.ref = 'refs/heads/some-ref'
    mockGithubContext.sha = '1234567890123456789012345678901234567890'
  })

  it('sets defaults', async () => {
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings).toBeTruthy()
    expect(settings.authToken).toBeFalsy()
    expect(settings.clean).toBe(true)
    expect(settings.commit).toBeTruthy()
    expect(settings.commit).toBe('1234567890123456789012345678901234567890')
    expect(settings.filter).toBe(undefined)
    expect(settings.sparseCheckout).toBe(undefined)
    expect(settings.sparseCheckoutConeMode).toBe(true)
    expect(settings.fetchDepth).toBe(1)
    expect(settings.fetchTags).toBe(false)
    expect(settings.showProgress).toBe(true)
    expect(settings.lfs).toBe(false)
    expect(settings.ref).toBe('refs/heads/some-ref')
    expect(settings.repositoryName).toBe('some-repo')
    expect(settings.repositoryOwner).toBe('some-owner')
    expect(settings.repositoryPath).toBe(gitHubWorkspace)
    expect(settings.setSafeDirectory).toBe(true)
    expect(settings.allowUnsafePrCheckout).toBe(false)
  })

  it('qualifies ref', async () => {
    let originalRef = mockGithubContext.ref
    try {
      mockGithubContext.ref = 'some-unqualified-ref'
      const settings: IGitSourceSettings = await inputHelper.getInputs()
      expect(settings).toBeTruthy()
      expect(settings.commit).toBe('1234567890123456789012345678901234567890')
      expect(settings.ref).toBe('refs/heads/some-unqualified-ref')
    } finally {
      mockGithubContext.ref = originalRef
    }
  })

  it('requires qualified repo', async () => {
    inputs.repository = 'some-unqualified-repo'
    try {
      await inputHelper.getInputs()
      throw 'should not reach here'
    } catch (err) {
      expect(`(${(err as any).message}`).toMatch(
        "Invalid repository 'some-unqualified-repo'"
      )
    }
  })

  it('roots path', async () => {
    inputs.path = 'some-directory/some-subdirectory'
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.repositoryPath).toBe(
      path.join(gitHubWorkspace, 'some-directory', 'some-subdirectory')
    )
  })

  it('sets ref to empty when explicit sha', async () => {
    inputs.ref = '1111111111222222222233333333334444444444'
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.ref).toBeFalsy()
    expect(settings.commit).toBe('1111111111222222222233333333334444444444')
  })

  it('sets ref to empty when explicit sha-256', async () => {
    inputs.ref =
      '1111111111222222222233333333334444444444555555555566666666667777'
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.ref).toBeFalsy()
    expect(settings.commit).toBe(
      '1111111111222222222233333333334444444444555555555566666666667777'
    )
  })

  it('sets sha to empty when explicit ref', async () => {
    inputs.ref = 'refs/heads/some-other-ref'
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.ref).toBe('refs/heads/some-other-ref')
    expect(settings.commit).toBeFalsy()
  })

  it('does not reclassify a ref as sha when a BOM is prefixed', async () => {
    // A fork branch named "<U+FEFF>" + 40 hex chars. core.getInput trims the
    // BOM by default, which previously collapsed this into a bare SHA and
    // bypassed the unsafe fork PR checkout guard.
    inputs.ref = '\uFEFF522d932fae5296da51fdf431934425ecf891c6a2'
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.commit).toBeFalsy()
    expect(settings.ref).toBe('522d932fae5296da51fdf431934425ecf891c6a2')
  })

  it('does not reclassify a sha-256 ref as sha when a BOM is prefixed', async () => {
    inputs.ref =
      '\uFEFF1111111111222222222233333333334444444444555555555566666666667777'
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.commit).toBeFalsy()
    expect(settings.ref).toBe(
      '1111111111222222222233333333334444444444555555555566666666667777'
    )
  })

  it('treats a sha surrounded by ascii whitespace as a commit', async () => {
    // ASCII whitespace can only come from the workflow author's YAML (git ref
    // names cannot contain it), so trimming it and treating the value as a
    // commit is safe.
    inputs.ref = '  1111111111222222222233333333334444444444  '
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.ref).toBeFalsy()
    expect(settings.commit).toBe('1111111111222222222233333333334444444444')
  })

  it('sets workflow organization ID', async () => {
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.workflowOrganizationId).toBe(123456)
  })

  describe('unsafe PR checkout guard', () => {
    const forkPayload = {
      repository: {id: 100},
      pull_request: {
        head: {
          sha: '1234567890123456789012345678901234567890',
          repo: {id: 200, full_name: 'attacker/fork'}
        },
        merge_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    }

    it('allows the default self-checkout on a fork pull_request_target', async () => {
      const originalEvent = mockGithubContext.eventName
      const originalPayload = mockGithubContext.payload
      try {
        mockGithubContext.eventName = 'pull_request_target'
        mockGithubContext.payload = forkPayload
        // Simulate a rebase/fast-forward merge where the base tip (event SHA)
        // equals the PR head SHA. The default self-checkout must still succeed.
        mockGithubContext.sha = '1234567890123456789012345678901234567890'
        const settings: IGitSourceSettings = await inputHelper.getInputs()
        expect(settings.commit).toBe('1234567890123456789012345678901234567890')
      } finally {
        mockGithubContext.eventName = originalEvent
        mockGithubContext.payload = originalPayload
      }
    })

    it('refuses an explicit fork repository on pull_request_target', async () => {
      const originalEvent = mockGithubContext.eventName
      const originalPayload = mockGithubContext.payload
      try {
        mockGithubContext.eventName = 'pull_request_target'
        mockGithubContext.payload = forkPayload
        inputs.repository = 'attacker/fork'
        await expect(inputHelper.getInputs()).rejects.toThrow(
          /Refusing to check out fork pull request code/
        )
      } finally {
        mockGithubContext.eventName = originalEvent
        mockGithubContext.payload = originalPayload
      }
    })
  })
})
