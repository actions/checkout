import * as core from '@actions/core'
import * as fs from 'fs'
import * as gitAuthHelper from '../lib/git-auth-helper'
import * as io from '@actions/io'
import * as path from 'path'
import {IGitCommandManager} from '../lib/git-command-manager'
import {IGitSourceSettings} from '../lib/git-source-settings'

const testWorkspace = path.join(__dirname, '_temp', 'git-auth-helper')
const originalRunnerTemp = process.env['RUNNER_TEMP']
const originalHome = process.env['HOME']
let workspace: string
let localGitConfigPath: string
let globalGitConfigPath: string
let runnerTemp: string
let tempHomedir: string
let git: IGitCommandManager & {env: {[key: string]: string}}
let settings: IGitSourceSettings

describe('git-auth-helper tests', () => {
  beforeAll(async () => {
    // Clear test workspace
    await io.rmRF(testWorkspace)
  })

  beforeEach(() => {
    // Mock setSecret
    jest.spyOn(core, 'setSecret').mockImplementation((secret: string) => {})

    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(jest.fn())
    jest.spyOn(core, 'warning').mockImplementation(jest.fn())
    jest.spyOn(core, 'info').mockImplementation(jest.fn())
    jest.spyOn(core, 'debug').mockImplementation(jest.fn())
  })

  afterEach(() => {
    // Unregister mocks
    jest.restoreAllMocks()

    // Restore HOME
    if (originalHome) {
      process.env['HOME'] = originalHome
    } else {
      delete process.env['HOME']
    }
  })

  afterAll(() => {
    // Restore RUNNER_TEMP
    delete process.env['RUNNER_TEMP']
    if (originalRunnerTemp) {
      process.env['RUNNER_TEMP'] = originalRunnerTemp
    }
  })

  const configureAuth_configuresAuthHeader =
    'configureAuth configures auth header'
  it(configureAuth_configuresAuthHeader, async () => {
    // Arrange
    await setup(configureAuth_configuresAuthHeader)
    expect(settings.authToken).toBeTruthy() // sanity check
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert config
    const configContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
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

  const configureAuth_configuresAuthHeaderEvenWhenPersistCredentialsFalse =
    'configureAuth configures auth header even when persist credentials false'
  it(
    configureAuth_configuresAuthHeaderEvenWhenPersistCredentialsFalse,
    async () => {
      // Arrange
      await setup(
        configureAuth_configuresAuthHeaderEvenWhenPersistCredentialsFalse
      )
      expect(settings.authToken).toBeTruthy() // sanity check
      settings.persistCredentials = false
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)

      // Act
      await authHelper.configureAuth()

      // Assert config
      const configContent = (
        await fs.promises.readFile(localGitConfigPath)
      ).toString()
      expect(
        configContent.indexOf(
          `http.https://github.com/.extraheader AUTHORIZATION`
        )
      ).toBeGreaterThanOrEqual(0)
    }
  )

  const configureAuth_registersBasicCredentialAsSecret =
    'configureAuth registers basic credential as secret'
  it(configureAuth_registersBasicCredentialAsSecret, async () => {
    // Arrange
    await setup(configureAuth_registersBasicCredentialAsSecret)
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

  const configureGlobalAuth_copiesGlobalGitConfig =
    'configureGlobalAuth copies global git config'
  it(configureGlobalAuth_copiesGlobalGitConfig, async () => {
    // Arrange
    await setup(configureGlobalAuth_copiesGlobalGitConfig)
    await fs.promises.writeFile(globalGitConfigPath, 'value-from-global-config')
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()
    await authHelper.configureGlobalAuth()

    // Assert original global config not altered
    let configContent = (
      await fs.promises.readFile(globalGitConfigPath)
    ).toString()
    expect(configContent).toBe('value-from-global-config')

    // Assert temporary global config
    expect(git.env['HOME']).toBeTruthy()
    const basicCredential = Buffer.from(
      `x-access-token:${settings.authToken}`,
      'utf8'
    ).toString('base64')
    configContent = (
      await fs.promises.readFile(path.join(git.env['HOME'], '.gitconfig'))
    ).toString()
    expect(
      configContent.indexOf('value-from-global-config')
    ).toBeGreaterThanOrEqual(0)
    expect(
      configContent.indexOf(
        `http.https://github.com/.extraheader AUTHORIZATION: basic ${basicCredential}`
      )
    ).toBeGreaterThanOrEqual(0)
  })

  const configureGlobalAuth_createsNewGlobalGitConfigWhenGlobalDoesNotExist =
    'configureGlobalAuth creates new git config when global does not exist'
  it(
    configureGlobalAuth_createsNewGlobalGitConfigWhenGlobalDoesNotExist,
    async () => {
      // Arrange
      await setup(
        configureGlobalAuth_createsNewGlobalGitConfigWhenGlobalDoesNotExist
      )
      await io.rmRF(globalGitConfigPath)
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)

      // Act
      await authHelper.configureAuth()
      await authHelper.configureGlobalAuth()

      // Assert original global config not recreated
      try {
        await fs.promises.stat(globalGitConfigPath)
        throw new Error(
          `Did not expect file to exist: '${globalGitConfigPath}'`
        )
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err
        }
      }

      // Assert temporary global config
      expect(git.env['HOME']).toBeTruthy()
      const basicCredential = Buffer.from(
        `x-access-token:${settings.authToken}`,
        'utf8'
      ).toString('base64')
      const configContent = (
        await fs.promises.readFile(path.join(git.env['HOME'], '.gitconfig'))
      ).toString()
      expect(
        configContent.indexOf(
          `http.https://github.com/.extraheader AUTHORIZATION: basic ${basicCredential}`
        )
      ).toBeGreaterThanOrEqual(0)
    }
  )

  const configureSubmoduleAuth_doesNotConfigureTokenWhenPersistCredentialsFalse =
    'configureSubmoduleAuth does not configure token when persist credentials false'
  it(
    configureSubmoduleAuth_doesNotConfigureTokenWhenPersistCredentialsFalse,
    async () => {
      // Arrange
      await setup(
        configureSubmoduleAuth_doesNotConfigureTokenWhenPersistCredentialsFalse
      )
      settings.persistCredentials = false
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)
      await authHelper.configureAuth()
      ;(git.submoduleForeach as jest.Mock<any, any>).mockClear() // reset calls

      // Act
      await authHelper.configureSubmoduleAuth()

      // Assert
      expect(git.submoduleForeach).not.toHaveBeenCalled()
    }
  )

  const configureSubmoduleAuth_configuresTokenWhenPersistCredentialsTrue =
    'configureSubmoduleAuth configures token when persist credentials true'
  it(
    configureSubmoduleAuth_configuresTokenWhenPersistCredentialsTrue,
    async () => {
      // Arrange
      await setup(
        configureSubmoduleAuth_configuresTokenWhenPersistCredentialsTrue
      )
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)
      await authHelper.configureAuth()
      ;(git.submoduleForeach as jest.Mock<any, any>).mockClear() // reset calls

      // Act
      await authHelper.configureSubmoduleAuth()

      // Assert
      expect(git.submoduleForeach).toHaveBeenCalledTimes(1)
    }
  )

  const removeAuth_removesToken = 'removeAuth removes token'
  it(removeAuth_removesToken, async () => {
    // Arrange
    await setup(removeAuth_removesToken)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()
    let gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('http.')).toBeGreaterThanOrEqual(0) // sanity check

    // Act
    await authHelper.removeAuth()

    // Assert git config
    gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('http.')).toBeLessThan(0)
  })

  const removeGlobalAuth_removesOverride = 'removeGlobalAuth removes override'
  it(removeGlobalAuth_removesOverride, async () => {
    // Arrange
    await setup(removeGlobalAuth_removesOverride)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()
    await authHelper.configureGlobalAuth()
    const homeOverride = git.env['HOME'] // Sanity check
    expect(homeOverride).toBeTruthy()
    await fs.promises.stat(path.join(git.env['HOME'], '.gitconfig'))

    // Act
    await authHelper.removeGlobalAuth()

    // Assert
    expect(git.env['HOME']).toBeUndefined()
    try {
      await fs.promises.stat(homeOverride)
      throw new Error(`Should have been deleted '${homeOverride}'`)
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }
  })
})

async function setup(testName: string): Promise<void> {
  testName = testName.replace(/[^a-zA-Z0-9_]+/g, '-')

  // Directories
  workspace = path.join(testWorkspace, testName, 'workspace')
  runnerTemp = path.join(testWorkspace, testName, 'runner-temp')
  tempHomedir = path.join(testWorkspace, testName, 'home-dir')
  await fs.promises.mkdir(workspace, {recursive: true})
  await fs.promises.mkdir(runnerTemp, {recursive: true})
  await fs.promises.mkdir(tempHomedir, {recursive: true})
  process.env['RUNNER_TEMP'] = runnerTemp
  process.env['HOME'] = tempHomedir

  // Create git config
  globalGitConfigPath = path.join(tempHomedir, '.gitconfig')
  await fs.promises.writeFile(globalGitConfigPath, '')
  localGitConfigPath = path.join(workspace, '.git', 'config')
  await fs.promises.mkdir(path.dirname(localGitConfigPath), {recursive: true})
  await fs.promises.writeFile(localGitConfigPath, '')

  git = {
    branchDelete: jest.fn(),
    branchExists: jest.fn(),
    branchList: jest.fn(),
    checkout: jest.fn(),
    checkoutDetach: jest.fn(),
    config: jest.fn(
      async (key: string, value: string, globalConfig?: boolean) => {
        const configPath = globalConfig
          ? path.join(git.env['HOME'] || tempHomedir, '.gitconfig')
          : localGitConfigPath
        await fs.promises.appendFile(configPath, `\n${key} ${value}`)
      }
    ),
    configExists: jest.fn(
      async (key: string, globalConfig?: boolean): Promise<boolean> => {
        const configPath = globalConfig
          ? path.join(git.env['HOME'] || tempHomedir, '.gitconfig')
          : localGitConfigPath
        const content = await fs.promises.readFile(configPath)
        const lines = content
          .toString()
          .split('\n')
          .filter(x => x)
        return lines.some(x => x.startsWith(key))
      }
    ),
    env: {},
    fetch: jest.fn(),
    getWorkingDirectory: jest.fn(() => workspace),
    init: jest.fn(),
    isDetached: jest.fn(),
    lfsFetch: jest.fn(),
    lfsInstall: jest.fn(),
    log1: jest.fn(),
    remoteAdd: jest.fn(),
    removeEnvironmentVariable: jest.fn((name: string) => delete git.env[name]),
    setEnvironmentVariable: jest.fn((name: string, value: string) => {
      git.env[name] = value
    }),
    submoduleForeach: jest.fn(async () => {
      return ''
    }),
    submoduleSync: jest.fn(),
    submoduleUpdate: jest.fn(),
    tagExists: jest.fn(),
    tryClean: jest.fn(),
    tryConfigUnset: jest.fn(
      async (key: string, globalConfig?: boolean): Promise<boolean> => {
        const configPath = globalConfig
          ? path.join(git.env['HOME'] || tempHomedir, '.gitconfig')
          : localGitConfigPath
        let content = await fs.promises.readFile(configPath)
        let lines = content
          .toString()
          .split('\n')
          .filter(x => x)
          .filter(x => !x.startsWith(key))
        await fs.promises.writeFile(configPath, lines.join('\n'))
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
    submodules: false,
    nestedSubmodules: false,
    persistCredentials: true,
    ref: 'refs/heads/master',
    repositoryName: 'my-repo',
    repositoryOwner: 'my-org',
    repositoryPath: ''
  }
}
