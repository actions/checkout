import * as core from '@actions/core'
import {adjustFetchDepthForCache} from '../src/git-source-provider'

// Mock @actions/core
jest.mock('@actions/core')

describe('adjustFetchDepthForCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing when referenceCache is not set', () => {
    const settings = {
      referenceCache: '',
      fetchDepth: 1,
      fetchDepthExplicit: false
    }
    adjustFetchDepthForCache(settings)
    expect(settings.fetchDepth).toBe(1)
    expect(core.warning).not.toHaveBeenCalled()
    expect(core.info).not.toHaveBeenCalled()
  })

  it('overrides fetchDepth to 0 when referenceCache is set and fetchDepth is default', () => {
    const settings = {
      referenceCache: '/cache/git-reference-cache',
      fetchDepth: 1,
      fetchDepthExplicit: false
    }
    adjustFetchDepthForCache(settings)
    expect(settings.fetchDepth).toBe(0)
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Overriding fetch-depth from 1 to 0')
    )
    expect(core.warning).not.toHaveBeenCalled()
  })

  it('warns but keeps fetchDepth when referenceCache is set and fetchDepth is explicit', () => {
    const settings = {
      referenceCache: '/cache/git-reference-cache',
      fetchDepth: 1,
      fetchDepthExplicit: true
    }
    adjustFetchDepthForCache(settings)
    expect(settings.fetchDepth).toBe(1)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("'fetch-depth: 1' is set with reference-cache enabled")
    )
    expect(core.info).not.toHaveBeenCalled()
  })

  it('does nothing when referenceCache is set and fetchDepth is already 0 (explicit)', () => {
    const settings = {
      referenceCache: '/cache/git-reference-cache',
      fetchDepth: 0,
      fetchDepthExplicit: true
    }
    adjustFetchDepthForCache(settings)
    expect(settings.fetchDepth).toBe(0)
    expect(core.warning).not.toHaveBeenCalled()
    expect(core.info).not.toHaveBeenCalled()
  })

  it('does nothing when referenceCache is set and fetchDepth is already 0 (default)', () => {
    const settings = {
      referenceCache: '/cache/git-reference-cache',
      fetchDepth: 0,
      fetchDepthExplicit: false
    }
    adjustFetchDepthForCache(settings)
    expect(settings.fetchDepth).toBe(0)
    expect(core.warning).not.toHaveBeenCalled()
    expect(core.info).not.toHaveBeenCalled()
  })

  it('warns with correct depth value when explicit fetchDepth is > 1', () => {
    const settings = {
      referenceCache: '/cache/git-reference-cache',
      fetchDepth: 42,
      fetchDepthExplicit: true
    }
    adjustFetchDepthForCache(settings)
    expect(settings.fetchDepth).toBe(42)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("'fetch-depth: 42' is set with reference-cache enabled")
    )
  })
})
