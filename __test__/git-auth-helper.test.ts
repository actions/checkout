import * as core from '@actions/core'
import * as fs from 'fs'
import * as gitAuthHelper from '../lib/git-auth-helper'
import * as io from '@actions/io'
import * as path from 'path'
import {IGitCommandManager} from '../lib/git-command-manager'
import {IGitSourceSettings} from '../lib/git-source-settings'

const testWorkspace = path.join(__dirname, '_temp', 'git-auth-helper')
const originalRunnerTemp = process.env['RUNNER_TEMP']
let workspace: string
let gitConfigPath: string
let runnerTemp: string
let git: IGitCommandManager
let settings: IGitSourceSettings

describe('git-auth-helper tests', () => {
  beforeAll(async () => {
    // Clear test workspace
    await io.rmRF(testWorkspace)
  })

  beforeEach(() => {
    // Mock setSecret
    jest.spyOn(core, 'setSecret').mockImplementation((secret: string) => {})
  })

  afterEach(() => {
    // Unregister mocks
    jest.restoreAllMocks()
  })

  afterAll(() => {
    // Restore RUNNER_TEMP
    delete process.env['RUNNER_TEMP']
    if (originalRunnerTemp) {
      process.env['RUNNER_TEMP'] = originalRunnerTemp
    }
  })

  const configuresAuthHeader = 'configures auth header'
  it(configuresAuthHeader, async () => {
    // Arrange
    await setup(configuresAuthHeader)
    expect(settings.authToken).toBeTruthy() // sanity check
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert config
    const configContent = (await fs.promises.readFile(gitConfigPath)).toString()
    const basicCredential = Buffer.from(
      `x-access-token:${settings.authToken}`,
      'utf8'
    ).toString('base64')
    expect(
      configContent.indexOf(
        `http.https://github.com/.extraheader AUTHORIZATION: basic ${basicCredential}`
      )
    ).toBeGreaterThanOrEqual(0)
  })

  const configuresAuthHeaderEvenWhenPersistCredentialsFalse =
    'configures auth header even when persist credentials false'
  it(configuresAuthHeaderEvenWhenPersistCredentialsFalse, async () => {
    // Arrange
    await setup(configuresAuthHeaderEvenWhenPersistCredentialsFalse)
    expect(settings.authToken).toBeTruthy() // sanity check
    settings.persistCredentials = false
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert config
    const configContent = (await fs.promises.readFile(gitConfigPath)).toString()
    expect(
      configContent.indexOf(
        `http.https://github.com/.extraheader AUTHORIZATION`
      )
    ).toBeGreaterThanOrEqual(0)
  })

  const registersBasicCredentialAsSecret =
    'registers basic credential as secret'
  it(registersBasicCredentialAsSecret, async () => {
    // Arrange
    await setup(registersBasicCredentialAsSecret)
    expect(settings.authToken).toBeTruthy() // sanity check
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert secret
    const setSecretSpy = core.setSecret as jest.Mock<any, any>
    expect(setSecretSpy).toHaveBeenCalledTimes(1)
    const expectedSecret = Buffer.from(
      `x-access-token:${settings.authToken}`,
      'utf8'
    ).toString('base64')
    expect(setSecretSpy).toHaveBeenCalledWith(expectedSecret)
  })

  const removesToken = 'removes token'
  it(removesToken, async () => {
    // Arrange
    await setup(removesToken)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()
    let gitConfigContent = (
      await fs.promises.readFile(gitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('http.')).toBeGreaterThanOrEqual(0) // sanity check

    // Act
    await authHelper.removeAuth()

    // Assert git config
    gitConfigContent = (await fs.promises.readFile(gitConfigPath)).toString()
    expect(gitConfigContent.indexOf('http.')).toBeLessThan(0)
  })
})

async function setup(testName: string): Promise<void> {
  testName = testName.replace(/[^a-zA-Z0-9_]+/g, '-')

  // Directories
  workspace = path.join(testWorkspace, testName, 'workspace')
  runnerTemp = path.join(testWorkspace, testName, 'runner-temp')
  await fs.promises.mkdir(workspace, {recursive: true})
  await fs.promises.mkdir(runnerTemp, {recursive: true})
  process.env['RUNNER_TEMP'] = runnerTemp

  // Create git config
  gitConfigPath = path.join(workspace, '.git', 'config')
  await fs.promises.mkdir(path.join(workspace, '.git'), {recursive: true})
  await fs.promises.writeFile(path.join(workspace, '.git', 'config'), '')

  git = {
    branchDelete: jest.fn(),
    branchExists: jest.fn(),
    branchList: jest.fn(),
    checkout: jest.fn(),
    checkoutDetach: jest.fn(),
    config: jest.fn(async (key: string, value: string) => {
      await fs.promises.appendFile(gitConfigPath, `\n${key} ${value}`)
    }),
    configExists: jest.fn(
      async (key: string): Promise<boolean> => {
        const content = await fs.promises.readFile(gitConfigPath)
        const lines = content
          .toString()
          .split('\n')
          .filter(x => x)
        return lines.some(x => x.startsWith(key))
      }
    ),
    fetch: jest.fn(),
    getWorkingDirectory: jest.fn(() => workspace),
    init: jest.fn(),
    isDetached: jest.fn(),
    lfsFetch: jest.fn(),
    lfsInstall: jest.fn(),
    log1: jest.fn(),
    remoteAdd: jest.fn(),
    setEnvironmentVariable: jest.fn(),
    tagExists: jest.fn(),
    tryClean: jest.fn(),
    tryConfigUnset: jest.fn(
      async (key: string): Promise<boolean> => {
        let content = await fs.promises.readFile(gitConfigPath)
        let lines = content
          .toString()
          .split('\n')
          .filter(x => x)
          .filter(x => !x.startsWith(key))
        await fs.promises.writeFile(gitConfigPath, lines.join('\n'))
        return true
      }
    ),
    tryDisableAutomaticGarbageCollection: jest.fn(),
    tryGetFetchUrl: jest.fn(),
    tryReset: jest.fn()
  }

  settings = {
    authToken: 'some auth token',
    clean: true,
    commit: '',
    fetchDepth: 1,
    lfs: false,
    persistCredentials: true,
    ref: 'refs/heads/master',
    repositoryName: 'my-repo',
    repositoryOwner: 'my-org',
    repositoryPath: ''
  }
}
