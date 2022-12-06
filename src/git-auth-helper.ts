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
import {default as uuid} from 'uuid/v4'
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
    this.settings = gitSourceSettings || (({} as unknown) as IGitSourceSettings)

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
    knownHosts += `# Begin implicitly added github.com\ngithub.com ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEAq2A7hRGmdnm9tUDbO9IDSwBK6TbQa+PXYPCPy6rbTrTtw7PHkccKrpp0yVhp5HdEIcKr6pLlVDBfOLX9QUsyCOV0wzfjIJNlGEYsdlLJizHhbn2mUjvSAHQqZETYP81eFzLQNnPHt4EVVUh7VfDESU84KezmD5QlWpXLmvU31/yMf+Se8xhHTvKSCZIFImWwoG6mbUoWf9nzpIoaSjB+weqqUUmpaaasXVal72J+UX2B+2RPW3RcT0eOzQgqlJL3RKrTJvdsjE3JEAvGq3lGHSZXy28G3skua2SmVi/w4yCE6gbODqnTWlg7+wC604ydGXA8VJiS5ap43JXiUFFAaQ==\n# End implicitly added github.com\n`
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
    // HTTP extra header
    await this.removeGitConfig(this.tokenConfigKey)
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
}
