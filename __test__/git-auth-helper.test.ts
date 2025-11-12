import * as core from '@actions/core'
import * as fs from 'fs'
import * as gitAuthHelper from '../lib/git-auth-helper'
import * as io from '@actions/io'
import * as os from 'os'
import * as path from 'path'
import * as stateHelper from '../lib/state-helper'
import {IGitCommandManager} from '../lib/git-command-manager'
import {IGitSourceSettings} from '../lib/git-source-settings'

const isWindows = process.platform === 'win32'
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
let sshPath: string
let githubServerUrl: string

describe('git-auth-helper tests', () => {
  beforeAll(async () => {
    // SSH
    sshPath = await io.which('ssh')

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

    // Mock state helper
    jest.spyOn(stateHelper, 'setSshKeyPath').mockImplementation(jest.fn())
    jest
      .spyOn(stateHelper, 'setSshKnownHostsPath')
      .mockImplementation(jest.fn())
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

  async function testAuthHeader(
    testName: string,
    serverUrl: string | undefined = undefined
  ) {
    // Arrange
    let expectedServerUrl = 'https://github.com'
    if (serverUrl) {
      githubServerUrl = serverUrl
      expectedServerUrl = githubServerUrl
    }

    await setup(testName)
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
        `http.${expectedServerUrl}/.extraheader AUTHORIZATION: basic ${basicCredential}`
      )
    ).toBeGreaterThanOrEqual(0)
  }

  const configureAuth_configuresAuthHeader =
    'configureAuth configures auth header'
  it(configureAuth_configuresAuthHeader, async () => {
    await testAuthHeader(configureAuth_configuresAuthHeader)
  })

  const configureAuth_AcceptsGitHubServerUrl =
    'inject https://my-ghes-server.com as github server url'
  it(configureAuth_AcceptsGitHubServerUrl, async () => {
    await testAuthHeader(
      configureAuth_AcceptsGitHubServerUrl,
      'https://my-ghes-server.com'
    )
  })

  const configureAuth_AcceptsGitHubServerUrlSetToGHEC =
    'inject https://github.com as github server url'
  it(configureAuth_AcceptsGitHubServerUrlSetToGHEC, async () => {
    await testAuthHeader(
      configureAuth_AcceptsGitHubServerUrl,
      'https://github.com'
    )
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

  const configureAuth_copiesUserKnownHosts =
    'configureAuth copies user known hosts'
  it(configureAuth_copiesUserKnownHosts, async () => {
    if (!sshPath) {
      process.stdout.write(
        `Skipped test "${configureAuth_copiesUserKnownHosts}". Executable 'ssh' not found in the PATH.\n`
      )
      return
    }

    // Arange
    await setup(configureAuth_copiesUserKnownHosts)
    expect(settings.sshKey).toBeTruthy() // sanity check

    // Mock fs.promises.readFile
    const realReadFile = fs.promises.readFile
    jest
      .spyOn(fs.promises, 'readFile')
      .mockImplementation(async (file: any, options: any): Promise<Buffer> => {
        const userKnownHostsPath = path.join(
          os.homedir(),
          '.ssh',
          'known_hosts'
        )
        if (file === userKnownHostsPath) {
          return Buffer.from('some-domain.com ssh-rsa ABCDEF')
        }

        return await realReadFile(file, options)
      })

    // Act
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()

    // Assert known hosts
    const actualSshKnownHostsPath = await getActualSshKnownHostsPath()
    const actualSshKnownHostsContent = (
      await fs.promises.readFile(actualSshKnownHostsPath)
    ).toString()
    expect(actualSshKnownHostsContent).toMatch(
      /some-domain\.com ssh-rsa ABCDEF/
    )
    expect(actualSshKnownHostsContent).toMatch(/github\.com ssh-rsa AAAAB3N/)
  })

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

  const setsSshCommandEnvVarWhenPersistCredentialsFalse =
    'sets SSH command env var when persist-credentials false'
  it(setsSshCommandEnvVarWhenPersistCredentialsFalse, async () => {
    if (!sshPath) {
      process.stdout.write(
        `Skipped test "${setsSshCommandEnvVarWhenPersistCredentialsFalse}". Executable 'ssh' not found in the PATH.\n`
      )
      return
    }

    // Arrange
    await setup(setsSshCommandEnvVarWhenPersistCredentialsFalse)
    settings.persistCredentials = false
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert git env var
    const actualKeyPath = await getActualSshKeyPath()
    const actualKnownHostsPath = await getActualSshKnownHostsPath()
    const expectedSshCommand = `"${sshPath}" -i "$RUNNER_TEMP/${path.basename(
      actualKeyPath
    )}" -o StrictHostKeyChecking=yes -o CheckHostIP=no -o "UserKnownHostsFile=$RUNNER_TEMP/${path.basename(
      actualKnownHostsPath
    )}"`
    expect(git.setEnvironmentVariable).toHaveBeenCalledWith(
      'GIT_SSH_COMMAND',
      expectedSshCommand
    )

    // Asserty git config
    const gitConfigLines = (await fs.promises.readFile(localGitConfigPath))
      .toString()
      .split('\n')
      .filter(x => x)
    expect(gitConfigLines).toHaveLength(1)
    expect(gitConfigLines[0]).toMatch(/^http\./)
  })

  const configureAuth_setsSshCommandWhenPersistCredentialsTrue =
    'sets SSH command when persist-credentials true'
  it(configureAuth_setsSshCommandWhenPersistCredentialsTrue, async () => {
    if (!sshPath) {
      process.stdout.write(
        `Skipped test "${configureAuth_setsSshCommandWhenPersistCredentialsTrue}". Executable 'ssh' not found in the PATH.\n`
      )
      return
    }

    // Arrange
    await setup(configureAuth_setsSshCommandWhenPersistCredentialsTrue)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert git env var
    const actualKeyPath = await getActualSshKeyPath()
    const actualKnownHostsPath = await getActualSshKnownHostsPath()
    const expectedSshCommand = `"${sshPath}" -i "$RUNNER_TEMP/${path.basename(
      actualKeyPath
    )}" -o StrictHostKeyChecking=yes -o CheckHostIP=no -o "UserKnownHostsFile=$RUNNER_TEMP/${path.basename(
      actualKnownHostsPath
    )}"`
    expect(git.setEnvironmentVariable).toHaveBeenCalledWith(
      'GIT_SSH_COMMAND',
      expectedSshCommand
    )

    // Asserty git config
    expect(git.config).toHaveBeenCalledWith(
      'core.sshCommand',
      expectedSshCommand
    )
  })

  const configureAuth_writesExplicitKnownHosts = 'writes explicit known hosts'
  it(configureAuth_writesExplicitKnownHosts, async () => {
    if (!sshPath) {
      process.stdout.write(
        `Skipped test "${configureAuth_writesExplicitKnownHosts}". Executable 'ssh' not found in the PATH.\n`
      )
      return
    }

    // Arrange
    await setup(configureAuth_writesExplicitKnownHosts)
    expect(settings.sshKey).toBeTruthy() // sanity check
    settings.sshKnownHosts = 'my-custom-host.com ssh-rsa ABC123'
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert known hosts
    const actualSshKnownHostsPath = await getActualSshKnownHostsPath()
    const actualSshKnownHostsContent = (
      await fs.promises.readFile(actualSshKnownHostsPath)
    ).toString()
    expect(actualSshKnownHostsContent).toMatch(
      /my-custom-host\.com ssh-rsa ABC123/
    )
    expect(actualSshKnownHostsContent).toMatch(/github\.com ssh-rsa AAAAB3N/)
  })

  const configureAuth_writesSshKeyAndImplicitKnownHosts =
    'writes SSH key and implicit known hosts'
  it(configureAuth_writesSshKeyAndImplicitKnownHosts, async () => {
    if (!sshPath) {
      process.stdout.write(
        `Skipped test "${configureAuth_writesSshKeyAndImplicitKnownHosts}". Executable 'ssh' not found in the PATH.\n`
      )
      return
    }

    // Arrange
    await setup(configureAuth_writesSshKeyAndImplicitKnownHosts)
    expect(settings.sshKey).toBeTruthy() // sanity check
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()

    // Assert SSH key
    const actualSshKeyPath = await getActualSshKeyPath()
    expect(actualSshKeyPath).toBeTruthy()
    const actualSshKeyContent = (
      await fs.promises.readFile(actualSshKeyPath)
    ).toString()
    expect(actualSshKeyContent).toBe(settings.sshKey + '\n')
    if (!isWindows) {
      // Assert read/write for user, not group or others.
      // Otherwise SSH client will error.
      expect((await fs.promises.stat(actualSshKeyPath)).mode & 0o777).toBe(
        0o600
      )
    }

    // Assert known hosts
    const actualSshKnownHostsPath = await getActualSshKnownHostsPath()
    const actualSshKnownHostsContent = (
      await fs.promises.readFile(actualSshKnownHostsPath)
    ).toString()
    expect(actualSshKnownHostsContent).toMatch(/github\.com ssh-rsa AAAAB3N/)
  })

  const configureGlobalAuth_configuresUrlInsteadOfWhenSshKeyNotSet =
    'configureGlobalAuth configures URL insteadOf when SSH key not set'
  it(configureGlobalAuth_configuresUrlInsteadOfWhenSshKeyNotSet, async () => {
    // Arrange
    await setup(configureGlobalAuth_configuresUrlInsteadOfWhenSshKeyNotSet)
    settings.sshKey = ''
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Act
    await authHelper.configureAuth()
    await authHelper.configureGlobalAuth()

    // Assert temporary global config
    expect(git.env['HOME']).toBeTruthy()
    const configContent = (
      await fs.promises.readFile(path.join(git.env['HOME'], '.gitconfig'))
    ).toString()
    expect(
      configContent.indexOf(`url.https://github.com/.insteadOf git@github.com`)
    ).toBeGreaterThanOrEqual(0)
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
        if ((err as any)?.code !== 'ENOENT') {
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

  const configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsFalseAndSshKeyNotSet =
    'configureSubmoduleAuth configures submodules when persist credentials false and SSH key not set'
  it(
    configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsFalseAndSshKeyNotSet,
    async () => {
      // Arrange
      await setup(
        configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsFalseAndSshKeyNotSet
      )
      settings.persistCredentials = false
      settings.sshKey = ''
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)
      await authHelper.configureAuth()
      const mockSubmoduleForeach = git.submoduleForeach as jest.Mock<any, any>
      mockSubmoduleForeach.mockClear() // reset calls

      // Act
      await authHelper.configureSubmoduleAuth()

      // Assert
      expect(mockSubmoduleForeach).toBeCalledTimes(1)
      expect(mockSubmoduleForeach.mock.calls[0][0] as string).toMatch(
        /unset-all.*insteadOf/
      )
    }
  )

  const configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsFalseAndSshKeySet =
    'configureSubmoduleAuth configures submodules when persist credentials false and SSH key set'
  it(
    configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsFalseAndSshKeySet,
    async () => {
      if (!sshPath) {
        process.stdout.write(
          `Skipped test "${configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsFalseAndSshKeySet}". Executable 'ssh' not found in the PATH.\n`
        )
        return
      }

      // Arrange
      await setup(
        configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsFalseAndSshKeySet
      )
      settings.persistCredentials = false
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)
      await authHelper.configureAuth()
      const mockSubmoduleForeach = git.submoduleForeach as jest.Mock<any, any>
      mockSubmoduleForeach.mockClear() // reset calls

      // Act
      await authHelper.configureSubmoduleAuth()

      // Assert
      expect(mockSubmoduleForeach).toHaveBeenCalledTimes(1)
      expect(mockSubmoduleForeach.mock.calls[0][0]).toMatch(
        /unset-all.*insteadOf/
      )
    }
  )

  const configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsTrueAndSshKeyNotSet =
    'configureSubmoduleAuth configures submodules when persist credentials true and SSH key not set'
  it(
    configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsTrueAndSshKeyNotSet,
    async () => {
      // Arrange
      await setup(
        configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsTrueAndSshKeyNotSet
      )
      settings.sshKey = ''
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)
      await authHelper.configureAuth()
      const mockSubmoduleForeach = git.submoduleForeach as jest.Mock<any, any>
      mockSubmoduleForeach.mockClear() // reset calls

      // Act
      await authHelper.configureSubmoduleAuth()

      // Assert
      expect(mockSubmoduleForeach).toHaveBeenCalledTimes(4)
      expect(mockSubmoduleForeach.mock.calls[0][0]).toMatch(
        /unset-all.*insteadOf/
      )
      expect(mockSubmoduleForeach.mock.calls[1][0]).toMatch(/http.*extraheader/)
      expect(mockSubmoduleForeach.mock.calls[2][0]).toMatch(
        /url.*insteadOf.*git@github.com:/
      )
      expect(mockSubmoduleForeach.mock.calls[3][0]).toMatch(
        /url.*insteadOf.*org-123456@github.com:/
      )
    }
  )

  const configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsTrueAndSshKeySet =
    'configureSubmoduleAuth configures submodules when persist credentials true and SSH key set'
  it(
    configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsTrueAndSshKeySet,
    async () => {
      if (!sshPath) {
        process.stdout.write(
          `Skipped test "${configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsTrueAndSshKeySet}". Executable 'ssh' not found in the PATH.\n`
        )
        return
      }

      // Arrange
      await setup(
        configureSubmoduleAuth_configuresSubmodulesWhenPersistCredentialsTrueAndSshKeySet
      )
      const authHelper = gitAuthHelper.createAuthHelper(git, settings)
      await authHelper.configureAuth()
      const mockSubmoduleForeach = git.submoduleForeach as jest.Mock<any, any>
      mockSubmoduleForeach.mockClear() // reset calls

      // Act
      await authHelper.configureSubmoduleAuth()

      // Assert
      expect(mockSubmoduleForeach).toHaveBeenCalledTimes(3)
      expect(mockSubmoduleForeach.mock.calls[0][0]).toMatch(
        /unset-all.*insteadOf/
      )
      expect(mockSubmoduleForeach.mock.calls[1][0]).toMatch(/http.*extraheader/)
      expect(mockSubmoduleForeach.mock.calls[2][0]).toMatch(/core\.sshCommand/)
    }
  )

  const removeAuth_removesSshCommand = 'removeAuth removes SSH command'
  it(removeAuth_removesSshCommand, async () => {
    if (!sshPath) {
      process.stdout.write(
        `Skipped test "${removeAuth_removesSshCommand}". Executable 'ssh' not found in the PATH.\n`
      )
      return
    }

    // Arrange
    await setup(removeAuth_removesSshCommand)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()
    let gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('core.sshCommand')).toBeGreaterThanOrEqual(
      0
    ) // sanity check
    const actualKeyPath = await getActualSshKeyPath()
    expect(actualKeyPath).toBeTruthy()
    await fs.promises.stat(actualKeyPath)
    const actualKnownHostsPath = await getActualSshKnownHostsPath()
    expect(actualKnownHostsPath).toBeTruthy()
    await fs.promises.stat(actualKnownHostsPath)

    // Act
    await authHelper.removeAuth()

    // Assert git config
    gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('core.sshCommand')).toBeLessThan(0)

    // Assert SSH key file
    try {
      await fs.promises.stat(actualKeyPath)
      throw new Error('SSH key should have been deleted')
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }

    // Assert known hosts file
    try {
      await fs.promises.stat(actualKnownHostsPath)
      throw new Error('SSH known hosts should have been deleted')
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }
  })

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

  const removeAuth_removesV6StyleCredentials =
    'removeAuth removes v6 style credentials'
  it(removeAuth_removesV6StyleCredentials, async () => {
    // Arrange
    await setup(removeAuth_removesV6StyleCredentials)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()

    // Manually create v6-style credentials that would be left by v6
    const credentialsFileName =
      'git-credentials-12345678-1234-1234-1234-123456789abc.config'
    const credentialsFilePath = path.join(runnerTemp, credentialsFileName)
    const basicCredential = Buffer.from(
      `x-access-token:${settings.authToken}`,
      'utf8'
    ).toString('base64')
    const credentialsContent = `[http "https://github.com/"]\n\textraheader = AUTHORIZATION: basic ${basicCredential}\n`
    await fs.promises.writeFile(credentialsFilePath, credentialsContent)

    // Add includeIf entries to local git config (simulating v6 configuration)
    const hostGitDir = path.join(workspace, '.git').replace(/\\/g, '/')
    await fs.promises.appendFile(
      localGitConfigPath,
      `[includeIf "gitdir:${hostGitDir}/"]\n\tpath = ${credentialsFilePath}\n`
    )
    await fs.promises.appendFile(
      localGitConfigPath,
      `[includeIf "gitdir:/github/workspace/.git/"]\n\tpath = /github/runner_temp/${credentialsFileName}\n`
    )

    // Verify v6 style config exists
    let gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('includeIf')).toBeGreaterThanOrEqual(0)
    expect(
      gitConfigContent.indexOf(credentialsFilePath)
    ).toBeGreaterThanOrEqual(0)
    await fs.promises.stat(credentialsFilePath) // Verify file exists

    // Mock the git methods to handle v6 cleanup
    const mockTryGetConfigKeys = git.tryGetConfigKeys as jest.Mock<any, any>
    mockTryGetConfigKeys.mockResolvedValue([
      `includeIf.gitdir:${hostGitDir}/.path`,
      'includeIf.gitdir:/github/workspace/.git/.path'
    ])

    const mockTryGetConfigValues = git.tryGetConfigValues as jest.Mock<any, any>
    mockTryGetConfigValues.mockImplementation(async (key: string) => {
      if (key === `includeIf.gitdir:${hostGitDir}/.path`) {
        return [credentialsFilePath]
      }
      if (key === 'includeIf.gitdir:/github/workspace/.git/.path') {
        return [`/github/runner_temp/${credentialsFileName}`]
      }
      return []
    })

    const mockTryConfigUnsetValue = git.tryConfigUnsetValue as jest.Mock<
      any,
      any
    >
    mockTryConfigUnsetValue.mockImplementation(
      async (
        key: string,
        value: string,
        globalConfig?: boolean,
        configPath?: string
      ) => {
        const targetPath = configPath || localGitConfigPath
        let content = await fs.promises.readFile(targetPath, 'utf8')
        // Remove the includeIf section
        const lines = content
          .split('\n')
          .filter(line => !line.includes('includeIf') && !line.includes(value))
        await fs.promises.writeFile(targetPath, lines.join('\n'))
        return true
      }
    )

    // Act
    await authHelper.removeAuth()

    // Assert includeIf entries removed from local git config
    gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('includeIf')).toBeLessThan(0)
    expect(gitConfigContent.indexOf(credentialsFilePath)).toBeLessThan(0)

    // Assert credentials config file deleted
    try {
      await fs.promises.stat(credentialsFilePath)
      throw new Error('Credentials file should have been deleted')
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }
  })

  const removeAuth_removesV6StyleCredentialsFromSubmodules =
    'removeAuth removes v6 style credentials from submodules'
  it(removeAuth_removesV6StyleCredentialsFromSubmodules, async () => {
    // Arrange
    await setup(removeAuth_removesV6StyleCredentialsFromSubmodules)

    // Create fake submodule config paths
    const submodule1Dir = path.join(workspace, '.git', 'modules', 'submodule-1')
    const submodule1ConfigPath = path.join(submodule1Dir, 'config')
    await fs.promises.mkdir(submodule1Dir, {recursive: true})
    await fs.promises.writeFile(submodule1ConfigPath, '')

    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()

    // Create v6-style credentials file
    const credentialsFileName =
      'git-credentials-abcdef12-3456-7890-abcd-ef1234567890.config'
    const credentialsFilePath = path.join(runnerTemp, credentialsFileName)
    const basicCredential = Buffer.from(
      `x-access-token:${settings.authToken}`,
      'utf8'
    ).toString('base64')
    const credentialsContent = `[http "https://github.com/"]\n\textraheader = AUTHORIZATION: basic ${basicCredential}\n`
    await fs.promises.writeFile(credentialsFilePath, credentialsContent)

    // Add includeIf entries to submodule config
    const submodule1GitDir = submodule1Dir.replace(/\\/g, '/')
    await fs.promises.appendFile(
      submodule1ConfigPath,
      `[includeIf "gitdir:${submodule1GitDir}/"]\n\tpath = ${credentialsFilePath}\n`
    )

    // Verify submodule config has includeIf entry
    let submoduleConfigContent = (
      await fs.promises.readFile(submodule1ConfigPath)
    ).toString()
    expect(submoduleConfigContent.indexOf('includeIf')).toBeGreaterThanOrEqual(
      0
    )
    expect(
      submoduleConfigContent.indexOf(credentialsFilePath)
    ).toBeGreaterThanOrEqual(0)

    // Mock getSubmoduleConfigPaths
    const mockGetSubmoduleConfigPaths =
      git.getSubmoduleConfigPaths as jest.Mock<any, any>
    mockGetSubmoduleConfigPaths.mockResolvedValue([submodule1ConfigPath])

    // Mock tryGetConfigKeys for submodule
    const mockTryGetConfigKeys = git.tryGetConfigKeys as jest.Mock<any, any>
    mockTryGetConfigKeys.mockImplementation(
      async (pattern: string, globalConfig?: boolean, configPath?: string) => {
        if (configPath === submodule1ConfigPath) {
          return [`includeIf.gitdir:${submodule1GitDir}/.path`]
        }
        return []
      }
    )

    // Mock tryGetConfigValues for submodule
    const mockTryGetConfigValues = git.tryGetConfigValues as jest.Mock<any, any>
    mockTryGetConfigValues.mockImplementation(
      async (key: string, globalConfig?: boolean, configPath?: string) => {
        if (
          configPath === submodule1ConfigPath &&
          key === `includeIf.gitdir:${submodule1GitDir}/.path`
        ) {
          return [credentialsFilePath]
        }
        return []
      }
    )

    // Mock tryConfigUnsetValue for submodule
    const mockTryConfigUnsetValue = git.tryConfigUnsetValue as jest.Mock<
      any,
      any
    >
    mockTryConfigUnsetValue.mockImplementation(
      async (
        key: string,
        value: string,
        globalConfig?: boolean,
        configPath?: string
      ) => {
        const targetPath = configPath || localGitConfigPath
        let content = await fs.promises.readFile(targetPath, 'utf8')
        const lines = content
          .split('\n')
          .filter(line => !line.includes('includeIf') && !line.includes(value))
        await fs.promises.writeFile(targetPath, lines.join('\n'))
        return true
      }
    )

    // Act
    await authHelper.removeAuth()

    // Assert submodule includeIf entries removed
    submoduleConfigContent = (
      await fs.promises.readFile(submodule1ConfigPath)
    ).toString()
    expect(submoduleConfigContent.indexOf('includeIf')).toBeLessThan(0)
    expect(submoduleConfigContent.indexOf(credentialsFilePath)).toBeLessThan(0)

    // Assert credentials file deleted
    try {
      await fs.promises.stat(credentialsFilePath)
      throw new Error('Credentials file should have been deleted')
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }
  })

  const removeAuth_skipsV6CleanupWhenEnvVarSet =
    'removeAuth skips v6 cleanup when ACTIONS_CHECKOUT_SKIP_V6_CLEANUP is set'
  it(removeAuth_skipsV6CleanupWhenEnvVarSet, async () => {
    // Arrange
    await setup(removeAuth_skipsV6CleanupWhenEnvVarSet)

    // Set the skip environment variable
    process.env['ACTIONS_CHECKOUT_SKIP_V6_CLEANUP'] = '1'

    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()

    // Create v6-style credentials file in RUNNER_TEMP
    const credentialsFileName = 'git-credentials-test-uuid-1234-5678.config'
    const credentialsFilePath = path.join(runnerTemp, credentialsFileName)
    const credentialsContent =
      '[http "https://github.com/"]\n\textraheader = AUTHORIZATION: basic token\n'
    await fs.promises.writeFile(credentialsFilePath, credentialsContent)

    // Add includeIf section to local git config (separate from http.* config)
    const includeIfSection = `\n[includeIf "gitdir:/some/path/.git/"]\n\tpath = ${credentialsFilePath}\n`
    await fs.promises.appendFile(localGitConfigPath, includeIfSection)

    // Verify v6 style config exists
    let gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(gitConfigContent.indexOf('includeIf')).toBeGreaterThanOrEqual(0)
    await fs.promises.stat(credentialsFilePath) // Verify file exists

    // Act
    await authHelper.removeAuth()

    // Assert v5 cleanup still happened (http.* removed)
    gitConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(
      gitConfigContent.indexOf('http.https://github.com/.extraheader')
    ).toBeLessThan(0)

    // Assert v6 cleanup was skipped - includeIf should still be present
    expect(gitConfigContent.indexOf('includeIf')).toBeGreaterThanOrEqual(0)
    expect(
      gitConfigContent.indexOf(credentialsFilePath)
    ).toBeGreaterThanOrEqual(0)

    // Assert credentials file still exists (wasn't deleted)
    await fs.promises.stat(credentialsFilePath) // File should still exist

    // Assert debug message was logged
    expect(core.debug).toHaveBeenCalledWith(
      'Skipping v6 style cleanup due to ACTIONS_CHECKOUT_SKIP_V6_CLEANUP'
    )

    // Cleanup
    delete process.env['ACTIONS_CHECKOUT_SKIP_V6_CLEANUP']
  })

  const removeGlobalConfig_removesOverride =
    'removeGlobalConfig removes override'
  it(removeGlobalConfig_removesOverride, async () => {
    // Arrange
    await setup(removeGlobalConfig_removesOverride)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()
    await authHelper.configureGlobalAuth()
    const homeOverride = git.env['HOME'] // Sanity check
    expect(homeOverride).toBeTruthy()
    await fs.promises.stat(path.join(git.env['HOME'], '.gitconfig'))

    // Act
    await authHelper.removeGlobalConfig()

    // Assert
    expect(git.env['HOME']).toBeUndefined()
    try {
      await fs.promises.stat(homeOverride)
      throw new Error(`Should have been deleted '${homeOverride}'`)
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
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
    disableSparseCheckout: jest.fn(),
    sparseCheckout: jest.fn(),
    sparseCheckoutNonConeMode: jest.fn(),
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
    getDefaultBranch: jest.fn(),
    getWorkingDirectory: jest.fn(() => workspace),
    init: jest.fn(),
    isDetached: jest.fn(),
    lfsFetch: jest.fn(),
    lfsInstall: jest.fn(),
    log1: jest.fn(),
    remoteAdd: jest.fn(),
    removeEnvironmentVariable: jest.fn((name: string) => delete git.env[name]),
    revParse: jest.fn(),
    setEnvironmentVariable: jest.fn((name: string, value: string) => {
      git.env[name] = value
    }),
    shaExists: jest.fn(),
    submoduleForeach: jest.fn(async () => {
      return ''
    }),
    submoduleSync: jest.fn(),
    submoduleStatus: jest.fn(async () => {
      return true
    }),
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
    getSubmoduleConfigPaths: jest.fn(async () => {
      return []
    }),
    tryConfigUnsetValue: jest.fn(async () => {
      return true
    }),
    tryGetConfigValues: jest.fn(async () => {
      return []
    }),
    tryGetConfigKeys: jest.fn(async () => {
      return []
    }),
    tryReset: jest.fn(),
    version: jest.fn()
  }

  settings = {
    authToken: 'some auth token',
    clean: true,
    commit: '',
    filter: undefined,
    sparseCheckout: [],
    sparseCheckoutConeMode: true,
    fetchDepth: 1,
    fetchTags: false,
    showProgress: true,
    lfs: false,
    submodules: false,
    nestedSubmodules: false,
    persistCredentials: true,
    ref: 'refs/heads/main',
    repositoryName: 'my-repo',
    repositoryOwner: 'my-org',
    repositoryPath: '',
    sshKey: sshPath ? 'some ssh private key' : '',
    sshKnownHosts: '',
    sshStrict: true,
    sshUser: '',
    workflowOrganizationId: 123456,
    setSafeDirectory: true,
    githubServerUrl: githubServerUrl
  }
}

async function getActualSshKeyPath(): Promise<string> {
  let actualTempFiles = (await fs.promises.readdir(runnerTemp))
    .sort()
    .map(x => path.join(runnerTemp, x))
  if (actualTempFiles.length === 0) {
    return ''
  }

  expect(actualTempFiles).toHaveLength(2)
  expect(actualTempFiles[0].endsWith('_known_hosts')).toBeFalsy()
  return actualTempFiles[0]
}

async function getActualSshKnownHostsPath(): Promise<string> {
  let actualTempFiles = (await fs.promises.readdir(runnerTemp))
    .sort()
    .map(x => path.join(runnerTemp, x))
  if (actualTempFiles.length === 0) {
    return ''
  }

  expect(actualTempFiles).toHaveLength(2)
  expect(actualTempFiles[1].endsWith('_known_hosts')).toBeTruthy()
  expect(actualTempFiles[1].startsWith(actualTempFiles[0])).toBeTruthy()
  return actualTempFiles[1]
}
