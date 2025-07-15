import * as assert from 'assert'
import * as refHelper from '../lib/ref-helper'
import {IGitCommandManager} from '../lib/git-command-manager'

const commit = '1234567890123456789012345678901234567890'
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
    expect(refSpec[0]).toBe(`+${commit}:refs/tags/my-tag`)
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
})
