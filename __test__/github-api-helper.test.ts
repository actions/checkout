import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals'

// Mock @actions/core
const mockDebug = jest.fn()
jest.unstable_mockModule('@actions/core', () => ({
  debug: mockDebug,
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}))

// Mock @actions/github
const mockGetOctokit = jest.fn()
jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit
}))

// Dynamic imports after mocking
const githubApiHelper = await import('../src/github-api-helper.js')

describe('github-api-helper object format', () => {
  let request: jest.Mock<any>

  function mockHashAlgorithmApi(hashAlgorithm: string): void {
    request = jest.fn(async () => ({
      data: {
        hash_algorithm: hashAlgorithm
      }
    }))
    mockGetOctokit.mockReturnValue({
      request
    } as any)
  }

  beforeEach(() => {
    mockDebug.mockClear()
    mockGetOctokit.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('detects SHA-256 from the repository hash algorithm endpoint', async () => {
    mockHashAlgorithmApi('sha256')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: 'sha256', succeeded: true})

    expect(mockGetOctokit).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({baseUrl: 'https://api.github.com'})
    )
    expect(request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/hash-algorithm',
      {owner: 'owner', repo: 'repo'}
    )
  })

  it('detects SHA-1 from the repository hash algorithm endpoint', async () => {
    mockHashAlgorithmApi('sha1')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: 'sha1', succeeded: true})
  })

  it('detects object format from an existing commit without API calls', async () => {
    const commitSha =
      '9422233ca7ee1b17f1e905d0e141faf0c401556c41cdc6acd71c6bd685da2e92'

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat(
        'token',
        'owner',
        'repo',
        undefined,
        commitSha
      )
    ).resolves.toEqual({format: 'sha256', succeeded: true})

    expect(mockGetOctokit).not.toHaveBeenCalled()
  })

  it('returns unsuccessful when the hash algorithm endpoint value is not recognized', async () => {
    mockHashAlgorithmApi('unknown')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: '', succeeded: false})
    expect(mockDebug).toHaveBeenCalledWith(
      'Unable to determine repository object format from hash-algorithm endpoint'
    )
  })

  it('returns unsuccessful when the hash algorithm API lookup fails', async () => {
    request = jest.fn(async () => {
      throw new Error('not found')
    })
    mockGetOctokit.mockReturnValue({
      request
    } as any)

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: '', succeeded: false})
    expect(mockDebug).toHaveBeenCalledWith(
      'Unable to determine repository object format from hash-algorithm endpoint: not found'
    )
  })
})
