import * as core from '@actions/core'
import * as fsHelper from '../lib/fs-helper'
import * as github from '@actions/github'
import * as inputHelper from '../lib/input-helper'
import * as path from 'path'
import * as workflowContextHelper from '../lib/workflow-context-helper'
import {IGitSourceSettings} from '../lib/git-source-settings'

const originalGitHubWorkspace = process.env['GITHUB_WORKSPACE']
const gitHubWorkspace = path.resolve('/checkout-tests/workspace')

// Inputs for mock @actions/core
let inputs = {} as any

// Shallow clone original @actions/github context
let originalContext = {...github.context}

describe('input-helper tests', () => {
  beforeAll(() => {
    // Mock getInput
    jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
      return inputs[name]
    })

    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(jest.fn())
    jest.spyOn(core, 'warning').mockImplementation(jest.fn())
    jest.spyOn(core, 'info').mockImplementation(jest.fn())
    jest.spyOn(core, 'debug').mockImplementation(jest.fn())

    // Mock github context
    jest.spyOn(github.context, 'repo', 'get').mockImplementation(() => {
      return {
        owner: 'some-owner',
        repo: 'some-repo'
      }
    })
    github.context.ref = 'refs/heads/some-ref'
    github.context.sha = '1234567890123456789012345678901234567890'

    // Mock ./fs-helper directoryExistsSync()
    jest
      .spyOn(fsHelper, 'directoryExistsSync')
      .mockImplementation((path: string) => path == gitHubWorkspace)

    // Mock ./workflowContextHelper getOrganizationId()
    jest
      .spyOn(workflowContextHelper, 'getOrganizationId')
      .mockImplementation(() => Promise.resolve(123456))

    // GitHub workspace
    process.env['GITHUB_WORKSPACE'] = gitHubWorkspace
  })

  beforeEach(() => {
    // Reset inputs
    inputs = {}
  })

  afterAll(() => {
    // Restore GitHub workspace
    delete process.env['GITHUB_WORKSPACE']
    if (originalGitHubWorkspace) {
      process.env['GITHUB_WORKSPACE'] = originalGitHubWorkspace
    }

    // Restore @actions/github context
    github.context.ref = originalContext.ref
    github.context.sha = originalContext.sha

    // Restore
    jest.restoreAllMocks()
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
  })

  it('qualifies ref', async () => {
    let originalRef = github.context.ref
    try {
      github.context.ref = 'some-unqualified-ref'
      const settings: IGitSourceSettings = await inputHelper.getInputs()
      expect(settings).toBeTruthy()
      expect(settings.commit).toBe('1234567890123456789012345678901234567890')
      expect(settings.ref).toBe('refs/heads/some-unqualified-ref')
    } finally {
      github.context.ref = originalRef
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

  it('sets sha to empty when explicit ref', async () => {
    inputs.ref = 'refs/heads/some-other-ref'
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.ref).toBe('refs/heads/some-other-ref')
    expect(settings.commit).toBeFalsy()
  })

  it('sets workflow organization ID', async () => {
    const settings: IGitSourceSettings = await inputHelper.getInputs()
    expect(settings.workflowOrganizationId).toBe(123456)
  })
})
