import * as assert from 'assert'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as refHelper from '../lib/ref-helper'
import {IGitCommandManager} from '../lib/git-command-manager'

const commit = '1234567890123456789012345678901234567890'
const sha256Commit =
  '1234567890123456789012345678901234567890123456789012345678901234'
let git: IGitCommandManager

describe('ref-helper tests', () => {
  beforeEach(() => {
    git = {} as unknown as IGitCommandManager
  })

  it('getCheckoutInfo requires git', async () => {
    const git = null as unknown as IGitCommandManager
    try {
      await refHelper.getCheckoutInfo(git, 'refs/heads/my/branch', commit)
      throw new Error('Should not reach here')
    } catch (err) {
      expect((err as any)?.message).toBe('Arg git cannot be empty')
    }
  })

  it('getCheckoutInfo requires ref or commit', async () => {
    try {
      await refHelper.getCheckoutInfo(git, '', '')
      throw new Error('Should not reach here')
    } catch (err) {
      expect((err as any)?.message).toBe(
        'Args ref and commit cannot both be empty'
      )
    }
  })

  it('getCheckoutInfo sha only', async () => {
    const checkoutInfo = await refHelper.getCheckoutInfo(git, '', commit)
    expect(checkoutInfo.ref).toBe(commit)
    expect(checkoutInfo.startPoint).toBeFalsy()
  })

  it('getCheckoutInfo sha-256 only', async () => {
    const checkoutInfo = await refHelper.getCheckoutInfo(git, '', sha256Commit)
    expect(checkoutInfo.ref).toBe(sha256Commit)
    expect(checkoutInfo.startPoint).toBeFalsy()
  })

  it('getCheckoutInfo refs/heads/', async () => {
    const checkoutInfo = await refHelper.getCheckoutInfo(
      git,
      'refs/heads/my/branch',
      commit
    )
    expect(checkoutInfo.ref).toBe('my/branch')
    expect(checkoutInfo.startPoint).toBe('refs/remotes/origin/my/branch')
  })

  it('getCheckoutInfo refs/pull/', async () => {
    const checkoutInfo = await refHelper.getCheckoutInfo(
      git,
      'refs/pull/123/merge',
      commit
    )
    expect(checkoutInfo.ref).toBe('refs/remotes/pull/123/merge')
    expect(checkoutInfo.startPoint).toBeFalsy()
  })

  it('getCheckoutInfo refs/tags/', async () => {
    const checkoutInfo = await refHelper.getCheckoutInfo(
      git,
      'refs/tags/my-tag',
      commit
    )
    expect(checkoutInfo.ref).toBe('refs/tags/my-tag')
    expect(checkoutInfo.startPoint).toBeFalsy()
  })

  it('getCheckoutInfo refs/', async () => {
    const checkoutInfo = await refHelper.getCheckoutInfo(
      git,
      'refs/gh/queue/main/pr-123',
      commit
    )
    expect(checkoutInfo.ref).toBe(commit)
    expect(checkoutInfo.startPoint).toBeFalsy()
  })

  it('getCheckoutInfo refs/ without commit', async () => {
    const checkoutInfo = await refHelper.getCheckoutInfo(
      git,
      'refs/non-standard-ref',
      ''
    )
    expect(checkoutInfo.ref).toBe('refs/non-standard-ref')
    expect(checkoutInfo.startPoint).toBeFalsy()
  })

  it('getCheckoutInfo unqualified branch only', async () => {
    git.branchExists = jest.fn(async (remote: boolean, pattern: string) => {
      return true
    })

    const checkoutInfo = await refHelper.getCheckoutInfo(git, 'my/branch', '')

    expect(checkoutInfo.ref).toBe('my/branch')
    expect(checkoutInfo.startPoint).toBe('refs/remotes/origin/my/branch')
  })

  it('getCheckoutInfo unqualified tag only', async () => {
    git.branchExists = jest.fn(async (remote: boolean, pattern: string) => {
      return false
    })
    git.tagExists = jest.fn(async (pattern: string) => {
      return true
    })

    const checkoutInfo = await refHelper.getCheckoutInfo(git, 'my-tag', '')

    expect(checkoutInfo.ref).toBe('refs/tags/my-tag')
    expect(checkoutInfo.startPoint).toBeFalsy()
  })

  it('getCheckoutInfo unqualified ref only, not a branch or tag', async () => {
    git.branchExists = jest.fn(async (remote: boolean, pattern: string) => {
      return false
    })
    git.tagExists = jest.fn(async (pattern: string) => {
      return false
    })

    try {
      await refHelper.getCheckoutInfo(git, 'my-ref', '')
      throw new Error('Should not reach here')
    } catch (err) {
      expect((err as any)?.message).toBe(
        "A branch or tag with the name 'my-ref' could not be found"
      )
    }
  })

  it('getRefSpec requires ref or commit', async () => {
    assert.throws(
      () => refHelper.getRefSpec('', ''),
      /Args ref and commit cannot both be empty/
    )
  })

  it('getRefSpec sha + refs/heads/', async () => {
    const refSpec = refHelper.getRefSpec('refs/heads/my/branch', commit)
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe(`+${commit}:refs/remotes/origin/my/branch`)
  })

  it('getRefSpec sha + refs/pull/', async () => {
    const refSpec = refHelper.getRefSpec('refs/pull/123/merge', commit)
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe(`+${commit}:refs/remotes/pull/123/merge`)
  })

  it('getRefSpec sha + refs/tags/', async () => {
    const refSpec = refHelper.getRefSpec('refs/tags/my-tag', commit)
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe(`+refs/tags/my-tag:refs/tags/my-tag`)
  })

  it('getRefSpec sha + refs/tags/ with fetchTags', async () => {
    // When fetchTags is true, only include tags wildcard (specific tag is redundant)
    const refSpec = refHelper.getRefSpec('refs/tags/my-tag', commit, true)
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe('+refs/tags/*:refs/tags/*')
  })

  it('getRefSpec sha + refs/heads/ with fetchTags', async () => {
    // When fetchTags is true, include both the branch refspec and tags wildcard
    const refSpec = refHelper.getRefSpec('refs/heads/my/branch', commit, true)
    expect(refSpec.length).toBe(2)
    expect(refSpec[0]).toBe('+refs/tags/*:refs/tags/*')
    expect(refSpec[1]).toBe(`+${commit}:refs/remotes/origin/my/branch`)
  })

  it('getRefSpec sha only', async () => {
    const refSpec = refHelper.getRefSpec('', commit)
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe(commit)
  })

  it('getRefSpec unqualified ref only', async () => {
    const refSpec = refHelper.getRefSpec('my-ref', '')
    expect(refSpec.length).toBe(2)
    expect(refSpec[0]).toBe('+refs/heads/my-ref*:refs/remotes/origin/my-ref*')
    expect(refSpec[1]).toBe('+refs/tags/my-ref*:refs/tags/my-ref*')
  })

  it('getRefSpec unqualified ref only with fetchTags', async () => {
    // When fetchTags is true, skip specific tag pattern since wildcard covers all
    const refSpec = refHelper.getRefSpec('my-ref', '', true)
    expect(refSpec.length).toBe(2)
    expect(refSpec[0]).toBe('+refs/tags/*:refs/tags/*')
    expect(refSpec[1]).toBe('+refs/heads/my-ref*:refs/remotes/origin/my-ref*')
  })

  it('getRefSpec refs/heads/ only', async () => {
    const refSpec = refHelper.getRefSpec('refs/heads/my/branch', '')
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe(
      '+refs/heads/my/branch:refs/remotes/origin/my/branch'
    )
  })

  it('getRefSpec refs/pull/ only', async () => {
    const refSpec = refHelper.getRefSpec('refs/pull/123/merge', '')
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe('+refs/pull/123/merge:refs/remotes/pull/123/merge')
  })

  it('getRefSpec refs/tags/ only', async () => {
    const refSpec = refHelper.getRefSpec('refs/tags/my-tag', '')
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe('+refs/tags/my-tag:refs/tags/my-tag')
  })

  it('getRefSpec refs/tags/ only with fetchTags', async () => {
    // When fetchTags is true, only include tags wildcard (specific tag is redundant)
    const refSpec = refHelper.getRefSpec('refs/tags/my-tag', '', true)
    expect(refSpec.length).toBe(1)
    expect(refSpec[0]).toBe('+refs/tags/*:refs/tags/*')
  })

  it('getRefSpec refs/heads/ only with fetchTags', async () => {
    // When fetchTags is true, include both the branch refspec and tags wildcard
    const refSpec = refHelper.getRefSpec('refs/heads/my/branch', '', true)
    expect(refSpec.length).toBe(2)
    expect(refSpec[0]).toBe('+refs/tags/*:refs/tags/*')
    expect(refSpec[1]).toBe(
      '+refs/heads/my/branch:refs/remotes/origin/my/branch'
    )
  })

  describe('checkCommitInfo', () => {
    const repositoryOwner = 'some-owner'
    const repositoryName = 'some-repo'
    const ref = 'refs/pull/123/merge'
    const sha1Head = '1111111111222222222233333333334444444444'
    const sha1Base = 'aaaaaaaaaabbbbbbbbbbccccccccccdddddddddd'
    const sha256Head =
      '1111111111222222222233333333334444444444555555555566666666667777'
    const sha256Base =
      'aaaaaaaaaabbbbbbbbbbccccccccccddddddddddeeeeeeeeeeffffffffff0000'
    let debugSpy: jest.SpyInstance
    let getOctokitSpy: jest.SpyInstance
    let repoGetSpy: jest.Mock
    let originalEventName: string
    let originalPayload: unknown
    let originalRef: string
    let originalSha: string

    function setPullRequestContext(
      expectedHeadSha: string,
      expectedBaseSha: string,
      mergeCommit: string
    ): void {
      ;(github.context as any).eventName = 'pull_request'
      github.context.ref = ref
      github.context.sha = mergeCommit
      ;(github.context as any).payload = {
        action: 'synchronize',
        after: expectedHeadSha,
        number: 123,
        pull_request: {
          base: {
            sha: expectedBaseSha
          }
        },
        repository: {
          private: false
        }
      }
    }

    beforeEach(() => {
      originalEventName = github.context.eventName
      originalPayload = github.context.payload
      originalRef = github.context.ref
      originalSha = github.context.sha

      jest.spyOn(github.context, 'repo', 'get').mockReturnValue({
        owner: repositoryOwner,
        repo: repositoryName
      })
      debugSpy = jest.spyOn(core, 'debug').mockImplementation(jest.fn())
      repoGetSpy = jest.fn(async () => ({}))
      getOctokitSpy = jest.spyOn(github, 'getOctokit').mockReturnValue({
        rest: {
          repos: {
            get: repoGetSpy
          }
        }
      } as any)
    })

    afterEach(() => {
      ;(github.context as any).eventName = originalEventName
      ;(github.context as any).payload = originalPayload
      github.context.ref = originalRef
      github.context.sha = originalSha
      jest.restoreAllMocks()
    })

    it('returns early for SHA-1 merge commit', async () => {
      setPullRequestContext(sha1Head, sha1Base, commit)

      await refHelper.checkCommitInfo(
        'token',
        `Merge ${sha1Head} into ${sha1Base}`,
        repositoryOwner,
        repositoryName,
        ref,
        commit
      )

      expect(getOctokitSpy).not.toHaveBeenCalled()
      expect(repoGetSpy).not.toHaveBeenCalled()
    })

    it('matches SHA-256 merge commit info', async () => {
      const actualHeadSha =
        '9999999999888888888877777777776666666666555555555544444444443333'
      setPullRequestContext(sha256Head, sha256Base, sha256Commit)

      await refHelper.checkCommitInfo(
        'token',
        `Merge ${actualHeadSha} into ${sha256Base}`,
        repositoryOwner,
        repositoryName,
        ref,
        sha256Commit
      )

      expect(getOctokitSpy).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          userAgent: expect.stringContaining(
            `expected_head_sha=${sha256Head};actual_head_sha=${actualHeadSha}`
          )
        })
      )
      expect(repoGetSpy).toHaveBeenCalledWith({
        owner: repositoryOwner,
        repo: repositoryName
      })
      expect(debugSpy).toHaveBeenCalledWith(
        `Expected head sha ${sha256Head}; actual head sha ${actualHeadSha}`
      )
      expect(debugSpy).not.toHaveBeenCalledWith('Unexpected message format')
    })

    it('does not match 50-char hex as a valid merge', async () => {
      const invalidHeadSha =
        '99999999998888888888777777777766666666665555555555'
      setPullRequestContext(sha1Head, sha1Base, commit)

      await refHelper.checkCommitInfo(
        'token',
        `Merge ${invalidHeadSha} into ${sha1Base}`,
        repositoryOwner,
        repositoryName,
        ref,
        commit
      )

      expect(getOctokitSpy).not.toHaveBeenCalled()
      expect(repoGetSpy).not.toHaveBeenCalled()
      expect(debugSpy).toHaveBeenCalledWith('Unexpected message format')
    })
  })
})
