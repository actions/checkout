import * as assert from 'assert'
import * as path from 'path'
import {ISourceSettings} from '../lib/git-source-provider'

const originalGitHubWorkspace = process.env['GITHUB_WORKSPACE']
const gitHubWorkspace = path.resolve('/checkout-tests/workspace')

// Late bind
let inputHelper: any

// Mock @actions/core
let inputs = {} as any
const mockCore = jest.genMockFromModule('@actions/core') as any
mockCore.getInput = (name: string) => {
  return inputs[name]
}

// Mock @actions/github
const mockGitHub = jest.genMockFromModule('@actions/github') as any
mockGitHub.context = {
  repo: {
    owner: 'some-owner',
    repo: 'some-repo'
  },
  ref: 'refs/heads/some-ref',
  sha: '1234567890123456789012345678901234567890'
}

// Mock ./fs-helper
const mockFSHelper = jest.genMockFromModule('../lib/fs-helper') as any
mockFSHelper.directoryExistsSync = (path: string) => path == gitHubWorkspace

describe('input-helper tests', () => {
  beforeAll(() => {
    // GitHub workspace
    process.env['GITHUB_WORKSPACE'] = gitHubWorkspace

    // Mocks
    jest.setMock('@actions/core', mockCore)
    jest.setMock('@actions/github', mockGitHub)
    jest.setMock('../lib/fs-helper', mockFSHelper)

    // Now import
    inputHelper = require('../lib/input-helper')
  })

  beforeEach(() => {
    // Reset inputs
    inputs = {}
  })

  afterAll(() => {
    // Reset GitHub workspace
    delete process.env['GITHUB_WORKSPACE']
    if (originalGitHubWorkspace) {
      process.env['GITHUB_WORKSPACE'] = originalGitHubWorkspace
    }

    // Reset modules
    jest.resetModules()
  })

  it('sets defaults', () => {
    const settings: ISourceSettings = inputHelper.getInputs()
    expect(settings).toBeTruthy()
    expect(settings.authToken).toBeFalsy()
    expect(settings.clean).toBe(true)
    expect(settings.commit).toBeTruthy()
    expect(settings.commit).toBe('1234567890123456789012345678901234567890')
    expect(settings.fetchDepth).toBe(1)
    expect(settings.lfs).toBe(false)
    expect(settings.ref).toBe('refs/heads/some-ref')
    expect(settings.repositoryName).toBe('some-repo')
    expect(settings.repositoryOwner).toBe('some-owner')
    expect(settings.repositoryPath).toBe(gitHubWorkspace)
  })

  it('qualifies ref', () => {
    let originalContext = mockGitHub.context
    try {
      mockGitHub.context = {...originalContext} // Shallow clone
      mockGitHub.context.ref = 'some-unqualified-ref'
      const settings: ISourceSettings = inputHelper.getInputs()
      expect(settings).toBeTruthy()
      expect(settings.commit).toBe('1234567890123456789012345678901234567890')
      expect(settings.ref).toBe('refs/heads/some-unqualified-ref')
    } finally {
      mockGitHub.context = originalContext
    }
  })

  it('requires qualified repo', () => {
    inputs.repository = 'some-unqualified-repo'
    assert.throws(() => {
      inputHelper.getInputs()
    }, /Invalid repository 'some-unqualified-repo'/)
  })

  it('roots path', () => {
    inputs.path = 'some-directory/some-subdirectory'
    const settings: ISourceSettings = inputHelper.getInputs()
    expect(settings.repositoryPath).toBe(
      path.join(gitHubWorkspace, 'some-directory', 'some-subdirectory')
    )
  })

  it('sets correct default ref/sha for other repo', () => {
    inputs.repository = 'some-owner/some-other-repo'
    const settings: ISourceSettings = inputHelper.getInputs()
    expect(settings.ref).toBe('refs/heads/master')
    expect(settings.commit).toBeFalsy()
  })

  it('sets ref to empty when explicit sha', () => {
    inputs.ref = '1111111111222222222233333333334444444444'
    const settings: ISourceSettings = inputHelper.getInputs()
    expect(settings.ref).toBeFalsy()
    expect(settings.commit).toBe('1111111111222222222233333333334444444444')
  })

  it('sets sha to empty when explicit ref', () => {
    inputs.ref = 'refs/heads/some-other-ref'
    const settings: ISourceSettings = inputHelper.getInputs()
    expect(settings.ref).toBe('refs/heads/some-other-ref')
    expect(settings.commit).toBeFalsy()
  })

  it('gives good error message for submodules input', () => {
    inputs.submodules = 'true'
    assert.throws(() => {
      inputHelper.getInputs()
    }, /The input 'submodules' is not supported/)
  })
})
