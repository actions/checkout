import * as github from '@actions/github'
import * as githubApiHelper from '../lib/github-api-helper'

jest.mock('@actions/github')

describe('github-api-helper tests', () => {
  describe('github enterprise compatibility', () => {
    beforeEach(() => {
      process.env.GITHUB_SERVER_URL = 'https://enterprise.git.com'
    })

    afterEach(() => {
      delete process.env.GITHUB_SERVER_URL
    })

    it('getDefaultBranch should use GITHUB_SERVER_URL to set the baseUrl', async () => {
      ;(github.getOctokit as jest.Mock).mockImplementation(() => {
        return {
          rest: {
            repos: {
              get: jest.fn(() => ({data: {default_branch: 'default-branch'}}))
            }
          }
        }
      })

      await githubApiHelper.getDefaultBranch('token', 'owner', 'repo')

      expect(github.getOctokit).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          baseUrl: 'https://enterprise.git.com/api/v3'
        })
      )
    })
  })
})
