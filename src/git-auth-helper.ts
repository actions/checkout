import * as assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as io from '@actions/io'
import * as os from 'os'
import * as path from 'path'
import * as regexpHelper from './regexp-helper'
import * as stateHelper from './state-helper'
import * as urlHelper from './url-helper'
import {v4 as uuid} from 'uuid'
import {IGitCommandManager} from './git-command-manager'
import {IGitSourceSettings} from './git-source-settings'

const IS_WINDOWS = process.platform === 'win32'
const SSH_COMMAND_KEY = 'core.sshCommand'

export interface IGitAuthHelper {
  configureAuth(): Promise<void>
  configureGlobalAuth(): Promise<void>
  configureSubmoduleAuth(): Promise<void>
  configureTempGlobalConfig(): Promise<string>
  removeAuth(): Promise<void>
  removeGlobalConfig(): Promise<void>
}

export function createAuthHelper(
  git: IGitCommandManager,
  settings?: IGitSourceSettings
): IGitAuthHelper {
  return new GitAuthHelper(git, settings)
}

class GitAuthHelper {
  private readonly git: IGitCommandManager
  private readonly settings: IGitSourceSettings
  private readonly tokenConfigKey: string
  private readonly tokenConfigValue: string
  private readonly tokenPlaceholderConfigValue: string
  private readonly insteadOfKey: string
  private readonly insteadOfValues: string[] = []
  private sshCommand = ''
  private sshKeyPath = ''
  private sshKnownHostsPath = ''
  private temporaryHomePath = ''
  private credentialsConfigPath = '' // Path to separate credentials config file in RUNNER_TEMP

  constructor(
    gitCommandManager: IGitCommandManager,
    gitSourceSettings: IGitSourceSettings | undefined
  ) {
    this.git = gitCommandManager
    this.settings = gitSourceSettings || ({} as unknown as IGitSourceSettings)

    // Token auth header
    const serverUrl = urlHelper.getServerUrl(this.settings.githubServerUrl)
    this.tokenConfigKey = `http.${serverUrl.origin}/.extraheader` // "origin" is SCHEME://HOSTNAME[:PORT]
    const basicCredential = Buffer.from(
      `x-access-token:${this.settings.authToken}`,
      'utf8'
    ).toString('base64')
    core.setSecret(basicCredential)
    this.tokenPlaceholderConfigValue = `AUTHORIZATION: basic ***`
    this.tokenConfigValue = `AUTHORIZATION: basic ${basicCredential}`

    // Instead of SSH URL
    this.insteadOfKey = `url.${serverUrl.origin}/.insteadOf` // "origin" is SCHEME://HOSTNAME[:PORT]
    this.insteadOfValues.push(`git@${serverUrl.hostname}:`)
    if (this.settings.workflowOrganizationId) {
      this.insteadOfValues.push(
        `org-${this.settings.workflowOrganizationId}@github.com:`
      )
    }
  }

  async configureAuth(): Promise<void> {
    // Remove possible previous values
    await this.removeAuth()

    // Configure new values
    await this.configureSsh()
    await this.configureToken()
  }

  async configureTempGlobalConfig(): Promise<string> {
    // Already setup global config
    if (this.temporaryHomePath?.length > 0) {
      return path.join(this.temporaryHomePath, '.gitconfig')
    }
    // Create a temp home directory
    const runnerTemp = process.env['RUNNER_TEMP'] || ''
    assert.ok(runnerTemp, 'RUNNER_TEMP is not defined')
    const uniqueId = uuid()
    this.temporaryHomePath = path.join(runnerTemp, uniqueId)
    await fs.promises.mkdir(this.temporaryHomePath, {recursive: true})

    // Copy the global git config
    const gitConfigPath = path.join(
      process.env['HOME'] || os.homedir(),
      '.gitconfig'
    )
    const newGitConfigPath = path.join(this.temporaryHomePath, '.gitconfig')
    let configExists = false
    try {
      await fs.promises.stat(gitConfigPath)
      configExists = true
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }
    if (configExists) {
      core.info(`Copying '${gitConfigPath}' to '${newGitConfigPath}'`)
      await io.cp(gitConfigPath, newGitConfigPath)
    } else {
      await fs.promises.writeFile(newGitConfigPath, '')
    }

    // Override HOME
    core.info(
      `Temporarily overriding HOME='${this.temporaryHomePath}' before making global git config changes`
    )
    this.git.setEnvironmentVariable('HOME', this.temporaryHomePath)

    return newGitConfigPath
  }

  async configureGlobalAuth(): Promise<void> {
    // 'configureTempGlobalConfig' noops if already set, just returns the path
    await this.configureTempGlobalConfig()
    try {
      // Configure the token
      await this.configureToken(true)

      // Configure HTTPS instead of SSH
      await this.git.tryConfigUnset(this.insteadOfKey, true)
      if (!this.settings.sshKey) {
        for (const insteadOfValue of this.insteadOfValues) {
          await this.git.config(
            this.insteadOfKey,
            insteadOfValue,
            true, // globalConfig?
            true // add?
          )
        }
      }
    } catch (err) {
      // Unset in case somehow written to the real global config
      core.info(
        'Encountered an error when attempting to configure token. Attempting unconfigure.'
      )
      await this.git.tryConfigUnset(this.tokenConfigKey, true)
      throw err
    }
  }

  async configureSubmoduleAuth(): Promise<void> {
    // Remove possible previous HTTPS instead of SSH
    await this.removeSubmoduleGitConfig(this.insteadOfKey)

    if (this.settings.persistCredentials) {
      // Get the credentials config file path in RUNNER_TEMP
      const credentialsConfigPath = this.getCredentialsConfigPath()

      // Container credentials config path
      const containerCredentialsPath = path.posix.join(
        '/github/runner_temp',
        path.basename(credentialsConfigPath)
      )

      // Get submodule config file paths.
      const configPaths = await this.git.getSubmoduleConfigPaths(
        this.settings.nestedSubmodules
      )

      // For each submodule, configure includeIf entries pointing to the shared credentials file.
      // Configure both host and container paths to support Docker container actions.
      for (const configPath of configPaths) {
        // Submodule Git directory
        let submoduleGitDir = path.dirname(configPath) // The config file is at .git/modules/submodule-name/config
        submoduleGitDir = submoduleGitDir.replace(/\\/g, '/') // Use forward slashes, even on Windows

        // Configure host includeIf
        await this.git.config(
          `includeIf.gitdir:${submoduleGitDir}.path`,
          credentialsConfigPath,
          false, // globalConfig?
          false, // add?
          configPath
        )

        // Container submodule git directory
        const githubWorkspace = process.env['GITHUB_WORKSPACE']
        assert.ok(githubWorkspace, 'GITHUB_WORKSPACE is not defined')
        let relativeSubmoduleGitDir = path.relative(
          githubWorkspace,
          submoduleGitDir
        )
        relativeSubmoduleGitDir = relativeSubmoduleGitDir.replace(/\\/g, '/') // Use forward slashes, even on Windows
        const containerSubmoduleGitDir = path.posix.join(
          '/github/workspace',
          relativeSubmoduleGitDir
        )

        // Configure container includeIf
        await this.git.config(
          `includeIf.gitdir:${containerSubmoduleGitDir}.path`,
          containerCredentialsPath,
          false, // globalConfig?
          false, // add?
          configPath
        )
      }

      if (this.settings.sshKey) {
        // Configure core.sshCommand
        await this.git.submoduleForeach(
          `git config --local '${SSH_COMMAND_KEY}' '${this.sshCommand}'`,
          this.settings.nestedSubmodules
        )
      } else {
        // Configure HTTPS instead of SSH
        for (const insteadOfValue of this.insteadOfValues) {
          await this.git.submoduleForeach(
            `git config --local --add '${this.insteadOfKey}' '${insteadOfValue}'`,
            this.settings.nestedSubmodules
          )
        }
      }
    }
  }

  async removeAuth(): Promise<void> {
    await this.removeSsh()
    await this.removeToken()
  }

  async removeGlobalConfig(): Promise<void> {
    if (this.temporaryHomePath?.length > 0) {
      core.debug(`Unsetting HOME override`)
      this.git.removeEnvironmentVariable('HOME')
      await io.rmRF(this.temporaryHomePath)
    }
  }

  /**
   * Configures SSH authentication by writing the SSH key and known hosts,
   * and setting up the GIT_SSH_COMMAND environment variable.
   */
  private async configureSsh(): Promise<void> {
    if (!this.settings.sshKey) {
      return
    }

    // Write key
    const runnerTemp = process.env['RUNNER_TEMP'] || ''
    assert.ok(runnerTemp, 'RUNNER_TEMP is not defined')
    const uniqueId = uuid()
    this.sshKeyPath = path.join(runnerTemp, uniqueId)
    stateHelper.setSshKeyPath(this.sshKeyPath)
    await fs.promises.mkdir(runnerTemp, {recursive: true})
    await fs.promises.writeFile(
      this.sshKeyPath,
      this.settings.sshKey.trim() + '\n',
      {mode: 0o600}
    )

    // Remove inherited permissions on Windows
    if (IS_WINDOWS) {
      const icacls = await io.which('icacls.exe')
      await exec.exec(
        `"${icacls}" "${this.sshKeyPath}" /grant:r "${process.env['USERDOMAIN']}\\${process.env['USERNAME']}:F"`
      )
      await exec.exec(`"${icacls}" "${this.sshKeyPath}" /inheritance:r`)
    }

    // Write known hosts
    const userKnownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts')
    let userKnownHosts = ''
    try {
      userKnownHosts = (
        await fs.promises.readFile(userKnownHostsPath)
      ).toString()
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err
      }
    }
    let knownHosts = ''
    if (userKnownHosts) {
      knownHosts += `# Begin from ${userKnownHostsPath}\n${userKnownHosts}\n# End from ${userKnownHostsPath}\n`
    }
    if (this.settings.sshKnownHosts) {
      knownHosts += `# Begin from input known hosts\n${this.settings.sshKnownHosts}\n# end from input known hosts\n`
    }
    knownHosts += `# Begin implicitly added github.com\ngithub.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=\n# End implicitly added github.com\n`
    this.sshKnownHostsPath = path.join(runnerTemp, `${uniqueId}_known_hosts`)
    stateHelper.setSshKnownHostsPath(this.sshKnownHostsPath)
    await fs.promises.writeFile(this.sshKnownHostsPath, knownHosts)

    // Configure GIT_SSH_COMMAND
    const sshPath = await io.which('ssh', true)
    this.sshCommand = `"${sshPath}" -i "$RUNNER_TEMP/${path.basename(
      this.sshKeyPath
    )}"`
    if (this.settings.sshStrict) {
      this.sshCommand += ' -o StrictHostKeyChecking=yes -o CheckHostIP=no'
    }
    this.sshCommand += ` -o "UserKnownHostsFile=$RUNNER_TEMP/${path.basename(
      this.sshKnownHostsPath
    )}"`
    core.info(`Temporarily overriding GIT_SSH_COMMAND=${this.sshCommand}`)
    this.git.setEnvironmentVariable('GIT_SSH_COMMAND', this.sshCommand)

    // Configure core.sshCommand
    if (this.settings.persistCredentials) {
      await this.git.config(SSH_COMMAND_KEY, this.sshCommand)
    }
  }

  /**
   * Configures token-based authentication by creating a credentials config file
   * and setting up includeIf entries to reference it.
   * @param globalConfig Whether to configure global config instead of local
   */
  private async configureToken(globalConfig?: boolean): Promise<void> {
    // Get the credentials config file path in RUNNER_TEMP
    const credentialsConfigPath = this.getCredentialsConfigPath()

    // Write placeholder to the separate credentials config file using git config.
    // This approach avoids the credential being captured by process creation audit events,
    // which are commonly logged. For more information, refer to
    // https://docs.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing
    await this.git.config(
      this.tokenConfigKey,
      this.tokenPlaceholderConfigValue,
      false, // globalConfig?
      false, // add?
      credentialsConfigPath
    )

    // Replace the placeholder in the credentials config file
    let content = (await fs.promises.readFile(credentialsConfigPath)).toString()
    const placeholderIndex = content.indexOf(this.tokenPlaceholderConfigValue)
    if (
      placeholderIndex < 0 ||
      placeholderIndex != content.lastIndexOf(this.tokenPlaceholderConfigValue)
    ) {
      throw new Error(
        `Unable to replace auth placeholder in ${credentialsConfigPath}`
      )
    }
    assert.ok(this.tokenConfigValue, 'tokenConfigValue is not defined')
    content = content.replace(
      this.tokenPlaceholderConfigValue,
      this.tokenConfigValue
    )
    await fs.promises.writeFile(credentialsConfigPath, content)

    // Add include or includeIf to reference the credentials config
    if (globalConfig) {
      // Global config file is temporary
      await this.git.config(
        'include.path',
        credentialsConfigPath,
        true // globalConfig?
      )
    } else {
      // Host git directory
      let gitDir = path.join(this.git.getWorkingDirectory(), '.git')
      gitDir = gitDir.replace(/\\/g, '/') // Use forward slashes, even on Windows

      // Configure host includeIf
      const hostIncludeKey = `includeIf.gitdir:${gitDir}.path`
      await this.git.config(hostIncludeKey, credentialsConfigPath)

      // Configure host includeIf for worktrees
      const hostWorktreeIncludeKey = `includeIf.gitdir:${gitDir}/worktrees/*.path`
      await this.git.config(hostWorktreeIncludeKey, credentialsConfigPath)

      // Container git directory
      const workingDirectory = this.git.getWorkingDirectory()
      const githubWorkspace = process.env['GITHUB_WORKSPACE']
      assert.ok(githubWorkspace, 'GITHUB_WORKSPACE is not defined')
      let relativePath = path.relative(githubWorkspace, workingDirectory)
      relativePath = relativePath.replace(/\\/g, '/') // Use forward slashes, even on Windows
      const containerGitDir = path.posix.join(
        '/github/workspace',
        relativePath,
        '.git'
      )

      // Container credentials config path
      const containerCredentialsPath = path.posix.join(
        '/github/runner_temp',
        path.basename(credentialsConfigPath)
      )

      // Configure container includeIf
      const containerIncludeKey = `includeIf.gitdir:${containerGitDir}.path`
      await this.git.config(containerIncludeKey, containerCredentialsPath)

      // Configure container includeIf for worktrees
      const containerWorktreeIncludeKey = `includeIf.gitdir:${containerGitDir}/worktrees/*.path`
      await this.git.config(
        containerWorktreeIncludeKey,
        containerCredentialsPath
      )
    }
  }

  /**
   * Gets or creates the path to the credentials config file in RUNNER_TEMP.
   * @returns The absolute path to the credentials config file
   */
  private getCredentialsConfigPath(): string {
    if (this.credentialsConfigPath) {
      return this.credentialsConfigPath
    }

    const runnerTemp = process.env['RUNNER_TEMP'] || ''
    assert.ok(runnerTemp, 'RUNNER_TEMP is not defined')

    // Create a unique filename for this checkout instance
    const configFileName = `git-credentials-${uuid()}.config`
    this.credentialsConfigPath = path.join(runnerTemp, configFileName)

    core.debug(`Credentials config path: ${this.credentialsConfigPath}`)
    return this.credentialsConfigPath
  }

  /**
   * Removes SSH authentication configuration by cleaning up SSH keys,
   * known hosts files, and SSH command configurations.
   */
  private async removeSsh(): Promise<void> {
    // SSH key
    const keyPath = this.sshKeyPath || stateHelper.SshKeyPath
    if (keyPath) {
      try {
        core.info(`Removing SSH key '${keyPath}'`)
        await io.rmRF(keyPath)
      } catch (err) {
        core.debug(`${(err as any)?.message ?? err}`)
        core.warning(`Failed to remove SSH key '${keyPath}'`)
      }
    }

    // SSH known hosts
    const knownHostsPath =
      this.sshKnownHostsPath || stateHelper.SshKnownHostsPath
    if (knownHostsPath) {
      try {
        core.info(`Removing SSH known hosts '${knownHostsPath}'`)
        await io.rmRF(knownHostsPath)
      } catch (err) {
        core.debug(`${(err as any)?.message ?? err}`)
        core.warning(`Failed to remove SSH known hosts '${knownHostsPath}'`)
      }
    }

    // SSH command
    core.info('Removing SSH command configuration')
    await this.removeGitConfig(SSH_COMMAND_KEY)
    await this.removeSubmoduleGitConfig(SSH_COMMAND_KEY)
  }

  /**
   * Removes token-based authentication by cleaning up HTTP headers,
   * includeIf entries, and credentials config files.
   */
  private async removeToken(): Promise<void> {
    // Remove HTTP extra header
    core.info('Removing HTTP extra header')
    await this.removeGitConfig(this.tokenConfigKey)
    await this.removeSubmoduleGitConfig(this.tokenConfigKey)

    // Collect credentials config paths that need to be removed
    const credentialsPaths = new Set<string>()

    // Remove includeIf entries that point to git-credentials-*.config files
    core.info('Removing includeIf entries pointing to credentials config files')
    const mainCredentialsPaths = await this.removeIncludeIfCredentials()
    mainCredentialsPaths.forEach(path => credentialsPaths.add(path))

    // Remove submodule includeIf entries that point to git-credentials-*.config files
    const submoduleConfigPaths = await this.git.getSubmoduleConfigPaths(true)
    for (const configPath of submoduleConfigPaths) {
      const submoduleCredentialsPaths =
        await this.removeIncludeIfCredentials(configPath)
      submoduleCredentialsPaths.forEach(path => credentialsPaths.add(path))
    }

    // Remove credentials config files
    for (const credentialsPath of credentialsPaths) {
      // Only remove credentials config files if they are under RUNNER_TEMP
      const runnerTemp = process.env['RUNNER_TEMP']
      assert.ok(runnerTemp, 'RUNNER_TEMP is not defined')
      if (credentialsPath.startsWith(runnerTemp)) {
        try {
          core.info(`Removing credentials config '${credentialsPath}'`)
          await io.rmRF(credentialsPath)
        } catch (err) {
          core.debug(`${(err as any)?.message ?? err}`)
          core.warning(
            `Failed to remove credentials config '${credentialsPath}'`
          )
        }
      } else {
        core.debug(
          `Skipping removal of credentials config '${credentialsPath}' - not under RUNNER_TEMP`
        )
      }
    }
  }

  /**
   * Removes a git config key from the local repository config.
   * @param configKey The git config key to remove
   */
  private async removeGitConfig(configKey: string): Promise<void> {
    if (
      (await this.git.configExists(configKey)) &&
      !(await this.git.tryConfigUnset(configKey))
    ) {
      // Load the config contents
      core.warning(`Failed to remove '${configKey}' from the git config`)
    }
  }

  /**
   * Removes a git config key from all submodule configs.
   * @param configKey The git config key to remove
   */
  private async removeSubmoduleGitConfig(configKey: string): Promise<void> {
    const pattern = regexpHelper.escape(configKey)
    await this.git.submoduleForeach(
      // Wrap the pipeline in quotes to make sure it's handled properly by submoduleForeach, rather than just the first part of the pipeline.
      `sh -c "git config --local --name-only --get-regexp '${pattern}' && git config --local --unset-all '${configKey}' || :"`,
      true
    )
  }

  /**
   * Removes includeIf entries that point to git-credentials-*.config files.
   * @param configPath Optional path to a specific git config file to operate on
   * @returns Array of unique credentials config file paths that were found and removed
   */
  private async removeIncludeIfCredentials(
    configPath?: string
  ): Promise<string[]> {
    const credentialsPaths = new Set<string>()

    try {
      // Get all includeIf.gitdir keys
      const keys = await this.git.tryGetConfigKeys(
        '^includeIf\\.gitdir:',
        false, // globalConfig?
        configPath
      )

      for (const key of keys) {
        // Get all values for this key
        const values = await this.git.tryGetConfigValues(
          key,
          false, // globalConfig?
          configPath
        )
        if (values.length > 0) {
          // Remove only values that match git-credentials-<uuid>.config pattern
          for (const value of values) {
            if (this.testCredentialsConfigPath(value)) {
              credentialsPaths.add(value)
              await this.git.tryConfigUnsetValue(key, value, false, configPath)
            }
          }
        }
      }
    } catch (err) {
      // Ignore errors - this is cleanup code
      if (configPath) {
        core.debug(`Error during includeIf cleanup for ${configPath}: ${err}`)
      } else {
        core.debug(`Error during includeIf cleanup: ${err}`)
      }
    }

    return Array.from(credentialsPaths)
  }

  /**
   * Tests if a path matches the git-credentials-*.config pattern.
   * @param path The path to test
   * @returns True if the path matches the credentials config pattern
   */
  private testCredentialsConfigPath(path: string): boolean {
    return /git-credentials-[0-9a-f-]+\.config$/i.test(path)
  }
}
