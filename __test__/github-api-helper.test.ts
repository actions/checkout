import * as core from '@actions/core'
import * as github from '@actions/github'
import * as githubApiHelper from '../lib/github-api-helper'

describe('github-api-helper object format', () => {
  let getOctokitSpy: jest.SpyInstance
  let debugSpy: jest.SpyInstance
  let request: jest.Mock

  function mockHashAlgorithmApi(hashAlgorithm: string): void {
    request = jest.fn(async () => ({
      data: {
        hash_algorithm: hashAlgorithm
      }
    }))
    getOctokitSpy = jest.spyOn(github, 'getOctokit').mockReturnValue({
      request
    } as any)
  }

  beforeEach(() => {
    debugSpy = jest.spyOn(core, 'debug').mockImplementation(jest.fn())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('detects SHA-256 from the repository hash algorithm endpoint', async () => {
    mockHashAlgorithmApi('sha256')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: 'sha256', succeeded: true})

    expect(getOctokitSpy).toHaveBeenCalledWith(
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
    getOctokitSpy = jest.spyOn(github, 'getOctokit')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat(
        'token',
        'owner',
        'repo',
        undefined,
        commitSha
      )
    ).resolves.toEqual({format: 'sha256', succeeded: true})

    expect(getOctokitSpy).not.toHaveBeenCalled()
  })

  it('returns unsuccessful when the hash algorithm endpoint value is not recognized', async () => {
    mockHashAlgorithmApi('unknown')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: '', succeeded: false})
    expect(debugSpy).toHaveBeenCalledWith(
      'Unable to determine repository object format from hash-algorithm endpoint'
    )
  })

  it('returns unsuccessful when the hash algorithm API lookup fails', async () => {
    request = jest.fn(async () => {
      throw new Error('not found')
    })
    jest.spyOn(github, 'getOctokit').mockReturnValue({
      request
    } as any)

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: '', succeeded: false})
    expect(debugSpy).toHaveBeenCalledWith(
      'Unable to determine repository object format from hash-algorithm endpoint: not found'
    )
  })
})
