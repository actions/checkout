import * as core from '@actions/core'
import * as github from '@actions/github'
import * as githubApiHelper from '../lib/github-api-helper'

describe('github-api-helper object format', () => {
  let getOctokitSpy: jest.SpyInstance
  let debugSpy: jest.SpyInstance
  let repoGet: jest.Mock
  let branchGet: jest.Mock

  function mockObjectFormatApi(defaultBranch: string, commitSha: string): void {
    repoGet = jest.fn(async () => ({
      data: {
        default_branch: defaultBranch
      }
    }))
    branchGet = jest.fn(async () => ({
      data: {
        commit: {
          sha: commitSha
        }
      }
    }))
    getOctokitSpy = jest.spyOn(github, 'getOctokit').mockReturnValue({
      rest: {
        repos: {
          get: repoGet,
          getBranch: branchGet
        }
      }
    } as any)
  }

  beforeEach(() => {
    debugSpy = jest.spyOn(core, 'debug').mockImplementation(jest.fn())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('detects SHA-256 from the default branch commit SHA', async () => {
    const commitSha =
      '9422233ca7ee1b17f1e905d0e141faf0c401556c41cdc6acd71c6bd685da2e92'
    mockObjectFormatApi('main', commitSha)

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: 'sha256', succeeded: true})

    expect(getOctokitSpy).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({baseUrl: 'https://api.github.com'})
    )
    expect(repoGet).toHaveBeenCalledWith({owner: 'owner', repo: 'repo'})
    expect(branchGet).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      branch: 'main'
    })
  })

  it('detects SHA-1 from the default branch commit SHA', async () => {
    mockObjectFormatApi('main', 'c988866043f035e6a46509872215f91d879044c9')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: 'sha1', succeeded: true})
  })

  it('returns unsuccessful when the default branch commit SHA is not recognized', async () => {
    mockObjectFormatApi('main', 'not-a-sha')

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: '', succeeded: false})
    expect(debugSpy).toHaveBeenCalledWith(
      'Unable to determine repository object format from default branch'
    )
  })

  it('returns unsuccessful when the repository API lookup fails', async () => {
    repoGet = jest.fn(async () => {
      throw new Error('not found')
    })
    branchGet = jest.fn()
    jest.spyOn(github, 'getOctokit').mockReturnValue({
      rest: {
        repos: {
          get: repoGet,
          getBranch: branchGet
        }
      }
    } as any)

    await expect(
      githubApiHelper.tryGetRepositoryObjectFormat('token', 'owner', 'repo')
    ).resolves.toEqual({format: '', succeeded: false})
    expect(branchGet).not.toHaveBeenCalled()
    expect(debugSpy).toHaveBeenCalledWith(
      'Unable to determine repository object format: not found'
    )
  })
})
