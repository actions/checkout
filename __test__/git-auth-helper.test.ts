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

    // Assert config - check that .git/config contains includeIf entries
    const localConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(
      localConfigContent.indexOf('includeIf.gitdir:')
    ).toBeGreaterThanOrEqual(0)

    // Assert credentials config file contains the actual credentials
    const credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFiles.length).toBe(1)
    const credentialsConfigPath = path.join(runnerTemp, credentialsFiles[0])
    const credentialsContent = (
      await fs.promises.readFile(credentialsConfigPath)
    ).toString()
    const basicCredential = Buffer.from(
      `x-access-token:${settings.authToken}`,
      'utf8'
    ).toString('base64')
    expect(
      credentialsContent.indexOf(
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
      configureAuth_AcceptsGitHubServerUrlSetToGHEC,
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

      // Assert config - check credentials config file (not local .git/config)
      const credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
        f => f.startsWith('git-credentials-') && f.endsWith('.config')
      )
      expect(credentialsFiles.length).toBe(1)
      const credentialsConfigPath = path.join(runnerTemp, credentialsFiles[0])
      const credentialsContent = (
        await fs.promises.readFile(credentialsConfigPath)
      ).toString()
      expect(
        credentialsContent.indexOf(
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

    // Assert git config
    const gitConfigLines = (await fs.promises.readFile(localGitConfigPath))
      .toString()
      .split('\n')
      .filter(x => x)
    // Should have includeIf entries pointing to credentials file
    expect(gitConfigLines.length).toBeGreaterThan(0)
    expect(
      gitConfigLines.some(line => line.indexOf('includeIf.gitdir:') >= 0)
    ).toBeTruthy()
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
    // Global config should have include.path pointing to credentials file
    expect(configContent.indexOf('include.path')).toBeGreaterThanOrEqual(0)

    // Check credentials in the separate config file
    const credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFiles.length).toBeGreaterThan(0)
    const credentialsConfigPath = path.join(runnerTemp, credentialsFiles[0])
    const credentialsContent = (
      await fs.promises.readFile(credentialsConfigPath)
    ).toString()
    expect(
      credentialsContent.indexOf(
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
      // Global config should have include.path pointing to credentials file
      expect(configContent.indexOf('include.path')).toBeGreaterThanOrEqual(0)

      // Check credentials in the separate config file
      const credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
        f => f.startsWith('git-credentials-') && f.endsWith('.config')
      )
      expect(credentialsFiles.length).toBeGreaterThan(0)
      const credentialsConfigPath = path.join(runnerTemp, credentialsFiles[0])
      const credentialsContent = (
        await fs.promises.readFile(credentialsConfigPath)
      ).toString()
      expect(
        credentialsContent.indexOf(
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
      // Should configure insteadOf (2 calls for two values)
      expect(mockSubmoduleForeach).toHaveBeenCalledTimes(3)
      expect(mockSubmoduleForeach.mock.calls[0][0]).toMatch(
        /unset-all.*insteadOf/
      )
      expect(mockSubmoduleForeach.mock.calls[1][0]).toMatch(
        /url.*insteadOf.*git@github.com:/
      )
      expect(mockSubmoduleForeach.mock.calls[2][0]).toMatch(
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
      // Should configure sshCommand (1 call)
      expect(mockSubmoduleForeach).toHaveBeenCalledTimes(2)
      expect(mockSubmoduleForeach.mock.calls[0][0]).toMatch(
        /unset-all.*insteadOf/
      )
      expect(mockSubmoduleForeach.mock.calls[1][0]).toMatch(/core\.sshCommand/)
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

    // Verify includeIf entries exist in local config
    let localConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(
      localConfigContent.indexOf('includeIf.gitdir:')
    ).toBeGreaterThanOrEqual(0)

    // Verify both host and container includeIf entries are present
    const hostGitDir = path.join(workspace, '.git').replace(/\\/g, '/')
    expect(
      localConfigContent.indexOf(`includeIf.gitdir:${hostGitDir}.path`)
    ).toBeGreaterThanOrEqual(0)
    expect(
      localConfigContent.indexOf('includeIf.gitdir:/github/workspace/.git.path')
    ).toBeGreaterThanOrEqual(0)

    // Verify credentials file exists
    let credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFiles.length).toBe(1)
    const credentialsFilePath = path.join(runnerTemp, credentialsFiles[0])

    // Verify credentials file contains the auth token
    let credentialsContent = (
      await fs.promises.readFile(credentialsFilePath)
    ).toString()
    const basicCredential = Buffer.from(
      `x-access-token:${settings.authToken}`,
      'utf8'
    ).toString('base64')
    expect(
      credentialsContent.indexOf(
        `http.https://github.com/.extraheader AUTHORIZATION: basic ${basicCredential}`
      )
    ).toBeGreaterThanOrEqual(0)

    // Verify the includeIf entries point to the credentials file
    const containerCredentialsPath = path.posix.join(
      '/github/runner_temp',
      path.basename(credentialsFilePath)
    )
    expect(
      localConfigContent.indexOf(credentialsFilePath)
    ).toBeGreaterThanOrEqual(0)
    expect(
      localConfigContent.indexOf(containerCredentialsPath)
    ).toBeGreaterThanOrEqual(0)

    // Act
    await authHelper.removeAuth()

    // Assert all includeIf entries removed from local git config
    localConfigContent = (
      await fs.promises.readFile(localGitConfigPath)
    ).toString()
    expect(localConfigContent.indexOf('includeIf.gitdir:')).toBeLessThan(0)
    expect(
      localConfigContent.indexOf(`includeIf.gitdir:${hostGitDir}.path`)
    ).toBeLessThan(0)
    expect(
      localConfigContent.indexOf('includeIf.gitdir:/github/workspace/.git.path')
    ).toBeLessThan(0)
    expect(localConfigContent.indexOf(credentialsFilePath)).toBeLessThan(0)
    expect(localConfigContent.indexOf(containerCredentialsPath)).toBeLessThan(0)

    // Assert credentials config file deleted
    credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFiles.length).toBe(0)

    // Verify credentials file no longer exists on disk
    try {
      await fs.promises.stat(credentialsFilePath)
      throw new Error('Credentials file should have been deleted')
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }
  })

  const removeAuth_removesTokenFromSubmodules =
    'removeAuth removes token from submodules'
  it(removeAuth_removesTokenFromSubmodules, async () => {
    // Arrange
    await setup(removeAuth_removesTokenFromSubmodules)

    // Create fake submodule config paths
    const submodule1Dir = path.join(workspace, '.git', 'modules', 'submodule-1')
    const submodule2Dir = path.join(workspace, '.git', 'modules', 'submodule-2')
    const submodule1ConfigPath = path.join(submodule1Dir, 'config')
    const submodule2ConfigPath = path.join(submodule2Dir, 'config')

    await fs.promises.mkdir(submodule1Dir, {recursive: true})
    await fs.promises.mkdir(submodule2Dir, {recursive: true})
    await fs.promises.writeFile(submodule1ConfigPath, '')
    await fs.promises.writeFile(submodule2ConfigPath, '')

    // Mock getSubmoduleConfigPaths to return our fake submodules (for both configure and remove)
    const mockGetSubmoduleConfigPaths =
      git.getSubmoduleConfigPaths as jest.Mock<any, any>
    mockGetSubmoduleConfigPaths.mockResolvedValue([
      submodule1ConfigPath,
      submodule2ConfigPath
    ])

    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    await authHelper.configureAuth()
    await authHelper.configureSubmoduleAuth()

    // Verify credentials file exists
    let credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFiles.length).toBe(1)
    const credentialsFilePath = path.join(runnerTemp, credentialsFiles[0])

    // Verify submodule 1 config has includeIf entries
    let submodule1Content = (
      await fs.promises.readFile(submodule1ConfigPath)
    ).toString()
    const submodule1GitDir = submodule1Dir.replace(/\\/g, '/')
    expect(
      submodule1Content.indexOf(`includeIf.gitdir:${submodule1GitDir}.path`)
    ).toBeGreaterThanOrEqual(0)
    expect(
      submodule1Content.indexOf(credentialsFilePath)
    ).toBeGreaterThanOrEqual(0)

    // Verify submodule 2 config has includeIf entries
    let submodule2Content = (
      await fs.promises.readFile(submodule2ConfigPath)
    ).toString()
    const submodule2GitDir = submodule2Dir.replace(/\\/g, '/')
    expect(
      submodule2Content.indexOf(`includeIf.gitdir:${submodule2GitDir}.path`)
    ).toBeGreaterThanOrEqual(0)
    expect(
      submodule2Content.indexOf(credentialsFilePath)
    ).toBeGreaterThanOrEqual(0)

    // Verify both host and container paths are in each submodule config
    const containerCredentialsPath = path.posix.join(
      '/github/runner_temp',
      path.basename(credentialsFilePath)
    )
    expect(
      submodule1Content.indexOf(containerCredentialsPath)
    ).toBeGreaterThanOrEqual(0)
    expect(
      submodule2Content.indexOf(containerCredentialsPath)
    ).toBeGreaterThanOrEqual(0)

    // Act - ensure mock persists for removeAuth
    mockGetSubmoduleConfigPaths.mockResolvedValue([
      submodule1ConfigPath,
      submodule2ConfigPath
    ])
    await authHelper.removeAuth()

    // Assert submodule 1 includeIf entries removed
    submodule1Content = (
      await fs.promises.readFile(submodule1ConfigPath)
    ).toString()
    expect(submodule1Content.indexOf('includeIf.gitdir:')).toBeLessThan(0)
    expect(submodule1Content.indexOf(credentialsFilePath)).toBeLessThan(0)
    expect(submodule1Content.indexOf(containerCredentialsPath)).toBeLessThan(0)

    // Assert submodule 2 includeIf entries removed
    submodule2Content = (
      await fs.promises.readFile(submodule2ConfigPath)
    ).toString()
    expect(submodule2Content.indexOf('includeIf.gitdir:')).toBeLessThan(0)
    expect(submodule2Content.indexOf(credentialsFilePath)).toBeLessThan(0)
    expect(submodule2Content.indexOf(containerCredentialsPath)).toBeLessThan(0)

    // Assert credentials config file deleted
    credentialsFiles = (await fs.promises.readdir(runnerTemp)).filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFiles.length).toBe(0)

    // Verify credentials file no longer exists on disk
    try {
      await fs.promises.stat(credentialsFilePath)
      throw new Error('Credentials file should have been deleted')
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }
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

  const testCredentialsConfigPath_matchesCredentialsConfigPaths =
    'testCredentialsConfigPath matches credentials config paths'
  it(testCredentialsConfigPath_matchesCredentialsConfigPaths, async () => {
    // Arrange
    await setup(testCredentialsConfigPath_matchesCredentialsConfigPaths)
    const authHelper = gitAuthHelper.createAuthHelper(git, settings)

    // Get a real credentials config path
    const credentialsConfigPath = await (
      authHelper as any
    ).getCredentialsConfigPath()

    // Act & Assert
    expect(
      (authHelper as any).testCredentialsConfigPath(credentialsConfigPath)
    ).toBe(true)
    expect(
      (authHelper as any).testCredentialsConfigPath(
        '/some/path/git-credentials-12345678-abcd-1234-5678-123456789012.config'
      )
    ).toBe(true)
    expect(
      (authHelper as any).testCredentialsConfigPath(
        '/some/path/git-credentials-abcdef12-3456-7890-abcd-ef1234567890.config'
      )
    ).toBe(true)

    // Test invalid paths
    expect(
      (authHelper as any).testCredentialsConfigPath(
        '/some/path/other-config.config'
      )
    ).toBe(false)
    expect(
      (authHelper as any).testCredentialsConfigPath(
        '/some/path/git-credentials-invalid.config'
      )
    ).toBe(false)
    expect(
      (authHelper as any).testCredentialsConfigPath(
        '/some/path/git-credentials-.config'
      )
    ).toBe(false)
    expect((authHelper as any).testCredentialsConfigPath('')).toBe(false)
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
  process.env['GITHUB_WORKSPACE'] = workspace

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
      async (
        key: string,
        value: string,
        globalConfig?: boolean,
        add?: boolean,
        configFile?: string
      ) => {
        const configPath =
          configFile ||
          (globalConfig
            ? path.join(git.env['HOME'] || tempHomedir, '.gitconfig')
            : localGitConfigPath)
        // Ensure directory exists
        await fs.promises.mkdir(path.dirname(configPath), {recursive: true})
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
    getSubmoduleConfigPaths: jest.fn(async () => []),
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
    tryConfigUnsetValue: jest.fn(
      async (
        key: string,
        value: string,
        globalConfig?: boolean,
        configPath?: string
      ): Promise<boolean> => {
        const targetConfigPath =
          configPath ||
          (globalConfig
            ? path.join(git.env['HOME'] || tempHomedir, '.gitconfig')
            : localGitConfigPath)
        let content = await fs.promises.readFile(targetConfigPath)
        let lines = content
          .toString()
          .split('\n')
          .filter(x => x)
          .filter(x => !(x.startsWith(key) && x.includes(value)))
        await fs.promises.writeFile(targetConfigPath, lines.join('\n'))
        return true
      }
    ),
    tryDisableAutomaticGarbageCollection: jest.fn(),
    tryGetFetchUrl: jest.fn(),
    tryGetConfigValues: jest.fn(
      async (
        key: string,
        globalConfig?: boolean,
        configPath?: string
      ): Promise<string[]> => {
        const targetConfigPath =
          configPath ||
          (globalConfig
            ? path.join(git.env['HOME'] || tempHomedir, '.gitconfig')
            : localGitConfigPath)
        const content = await fs.promises.readFile(targetConfigPath)
        const lines = content
          .toString()
          .split('\n')
          .filter(x => x && x.startsWith(key))
          .map(x => x.substring(key.length).trim())
        return lines
      }
    ),
    tryGetConfigKeys: jest.fn(
      async (
        pattern: string,
        globalConfig?: boolean,
        configPath?: string
      ): Promise<string[]> => {
        const targetConfigPath =
          configPath ||
          (globalConfig
            ? path.join(git.env['HOME'] || tempHomedir, '.gitconfig')
            : localGitConfigPath)
        const content = await fs.promises.readFile(targetConfigPath)
        const lines = content
          .toString()
          .split('\n')
          .filter(x => x)
        const keys = lines
          .filter(x => new RegExp(pattern).test(x.split(' ')[0]))
          .map(x => x.split(' ')[0])
        return [...new Set(keys)] // Remove duplicates
      }
    ),
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
    .filter(x => !x.startsWith('git-credentials-')) // Exclude credentials config file
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
    .filter(x => !x.startsWith('git-credentials-')) // Exclude credentials config file
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
