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
    const newGitConfigPath = await this.configureTempGlobalConfig()
    try {
      // Configure the token
      await this.configureToken(newGitConfigPath, true)

      // Configure HTTPS instead of SSH
      await this.git.tryConfigUnset(this.insteadOfKey, true)
      if (!this.settings.sshKey) {
        for (const insteadOfValue of this.insteadOfValues) {
          await this.git.config(this.insteadOfKey, insteadOfValue, true, true)
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
    await this.removeGitConfig(this.insteadOfKey, true)

    if (this.settings.persistCredentials) {
      // Configure a placeholder value. This approach avoids the credential being captured
      // by process creation audit events, which are commonly logged. For more information,
      // refer to https://docs.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing
      const output = await this.git.submoduleForeach(
        // wrap the pipeline in quotes to make sure it's handled properly by submoduleForeach, rather than just the first part of the pipeline
        `sh -c "git config --local '${this.tokenConfigKey}' '${this.tokenPlaceholderConfigValue}' && git config --local --show-origin --name-only --get-regexp remote.origin.url"`,
        this.settings.nestedSubmodules
      )

      // Replace the placeholder
      const configPaths: string[] =
        output.match(/(?<=(^|\n)file:)[^\t]+(?=\tremote\.origin\.url)/g) || []
      for (const configPath of configPaths) {
        core.debug(`Replacing token placeholder in '${configPath}'`)
        await this.replaceTokenPlaceholder(configPath)
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

  private async configureToken(
    configPath?: string,
    globalConfig?: boolean
  ): Promise<void> {
    // Validate args
    assert.ok(
      (configPath && globalConfig) || (!configPath && !globalConfig),
      'Unexpected configureToken parameter combinations'
    )

    // Default config path
    if (!configPath && !globalConfig) {
      configPath = path.join(this.git.getWorkingDirectory(), '.git', 'config')
    }

    // Configure a placeholder value. This approach avoids the credential being captured
    // by process creation audit events, which are commonly logged. For more information,
    // refer to https://docs.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing
    await this.git.config(
      this.tokenConfigKey,
      this.tokenPlaceholderConfigValue,
      globalConfig
    )

    // Replace the placeholder
    await this.replaceTokenPlaceholder(configPath || '')
  }

  private async replaceTokenPlaceholder(configPath: string): Promise<void> {
    assert.ok(configPath, 'configPath is not defined')
    let content = (await fs.promises.readFile(configPath)).toString()
    const placeholderIndex = content.indexOf(this.tokenPlaceholderConfigValue)
    if (
      placeholderIndex < 0 ||
      placeholderIndex != content.lastIndexOf(this.tokenPlaceholderConfigValue)
    ) {
      throw new Error(`Unable to replace auth placeholder in ${configPath}`)
    }
    assert.ok(this.tokenConfigValue, 'tokenConfigValue is not defined')
    content = content.replace(
      this.tokenPlaceholderConfigValue,
      this.tokenConfigValue
    )
    await fs.promises.writeFile(configPath, content)
  }

  private async removeSsh(): Promise<void> {
    // SSH key
    const keyPath = this.sshKeyPath || stateHelper.SshKeyPath
    if (keyPath) {
      try {
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
        await io.rmRF(knownHostsPath)
      } catch {
        // Intentionally empty
      }
    }

    // SSH command
    await this.removeGitConfig(SSH_COMMAND_KEY)
  }

  private async removeToken(): Promise<void> {
    // Remove HTTP extra header from local git config and submodule configs
    await this.removeGitConfig(this.tokenConfigKey)

    //
    // Cleanup actions/checkout@v6 style credentials
    //
    const skipV6Cleanup = process.env['ACTIONS_CHECKOUT_SKIP_V6_CLEANUP']
    if (skipV6Cleanup === '1' || skipV6Cleanup?.toLowerCase() === 'true') {
      core.debug(
        'Skipping v6 style cleanup due to ACTIONS_CHECKOUT_SKIP_V6_CLEANUP'
      )
      return
    }

    try {
      // Collect credentials config paths that need to be removed
      const credentialsPaths = new Set<string>()

      // Remove includeIf entries that point to git-credentials-*.config files
      const mainCredentialsPaths = await this.removeIncludeIfCredentials()
      mainCredentialsPaths.forEach(path => credentialsPaths.add(path))

      // Remove submodule includeIf entries that point to git-credentials-*.config files
      try {
        const submoduleConfigPaths =
          await this.git.getSubmoduleConfigPaths(true)
        for (const configPath of submoduleConfigPaths) {
          const submoduleCredentialsPaths =
            await this.removeIncludeIfCredentials(configPath)
          submoduleCredentialsPaths.forEach(path => credentialsPaths.add(path))
        }
      } catch (err) {
        core.debug(`Unable to get submodule config paths: ${err}`)
      }

      // Remove credentials config files
      for (const credentialsPath of credentialsPaths) {
        // Only remove credentials config files if they are under RUNNER_TEMP
        const runnerTemp = process.env['RUNNER_TEMP']
        if (runnerTemp && credentialsPath.startsWith(runnerTemp)) {
          try {
            await io.rmRF(credentialsPath)
          } catch (err) {
            core.debug(
              `Failed to remove credentials config '${credentialsPath}': ${err}`
            )
          }
        }
      }
    } catch (err) {
      core.debug(`Failed to cleanup v6 style credentials: ${err}`)
    }
  }

  private async removeGitConfig(
    configKey: string,
    submoduleOnly: boolean = false
  ): Promise<void> {
    if (!submoduleOnly) {
      if (
        (await this.git.configExists(configKey)) &&
        !(await this.git.tryConfigUnset(configKey))
      ) {
        // Load the config contents
        core.warning(`Failed to remove '${configKey}' from the git config`)
      }
    }

    const pattern = regexpHelper.escape(configKey)
    await this.git.submoduleForeach(
      // wrap the pipeline in quotes to make sure it's handled properly by submoduleForeach, rather than just the first part of the pipeline
      `sh -c "git config --local --name-only --get-regexp '${pattern}' && git config --local --unset-all '${configKey}' || :"`,
      true
    )
  }

  /**
   * Removes includeIf entries that point to git-credentials-*.config files.
   * This handles cleanup of credentials configured by newer versions of the action.
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
      core.debug(
        `Error during includeIf cleanup${configPath ? ` for ${configPath}` : ''}: ${err}`
      )
    }

    return Array.from(credentialsPaths)
  }

  /**
   * Tests if a path matches the git-credentials-*.config pattern used by newer versions.
   * @param path The path to test
   * @returns True if the path matches the credentials config pattern
   */
  private testCredentialsConfigPath(path: string): boolean {
    return /git-credentials-[0-9a-f-]+\.config$/i.test(path)
  }
}
