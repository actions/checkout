import * as assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as io from '@actions/io'
import * as os from 'os'
import * as path from 'path'
import * as stateHelper from './state-helper'
import {default as uuid} from 'uuid/v4'
import {IGitCommandManager} from './git-command-manager'
import {IGitSourceSettings} from './git-source-settings'

const IS_WINDOWS = process.platform === 'win32'
const HOSTNAME = 'github.com'
const EXTRA_HEADER_KEY = `http.https://${HOSTNAME}/.extraheader`

export interface IGitAuthHelper {
  configureAuth(): Promise<void>
  removeAuth(): Promise<void>
}

export function createAuthHelper(
  git: IGitCommandManager,
  settings?: IGitSourceSettings
): IGitAuthHelper {
  return new GitAuthHelper(git, settings)
}

class GitAuthHelper {
  private git: IGitCommandManager
  private settings: IGitSourceSettings

  constructor(
    gitCommandManager: IGitCommandManager,
    gitSourceSettings?: IGitSourceSettings
  ) {
    this.git = gitCommandManager
    this.settings = gitSourceSettings || (({} as unknown) as IGitSourceSettings)
  }

  async configureAuth(): Promise<void> {
    // Remove possible previous values
    await this.removeAuth()

    // Configure new values
    await this.configureToken()
  }

  async removeAuth(): Promise<void> {
    await this.removeToken()
  }

  private async configureToken(): Promise<void> {
    // Configure a placeholder value. This approach avoids the credential being captured
    // by process creation audit events, which are commonly logged. For more information,
    // refer to https://docs.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing
    const placeholder = `AUTHORIZATION: basic ***`
    await this.git.config(EXTRA_HEADER_KEY, placeholder)

    // Determine the basic credential value
    const basicCredential = Buffer.from(
      `x-access-token:${this.settings.authToken}`,
      'utf8'
    ).toString('base64')
    core.setSecret(basicCredential)

    // Replace the value in the config file
    const configPath = path.join(
      this.git.getWorkingDirectory(),
      '.git',
      'config'
    )
    let content = (await fs.promises.readFile(configPath)).toString()
    const placeholderIndex = content.indexOf(placeholder)
    if (
      placeholderIndex < 0 ||
      placeholderIndex != content.lastIndexOf(placeholder)
    ) {
      throw new Error('Unable to replace auth placeholder in .git/config')
    }
    content = content.replace(
      placeholder,
      `AUTHORIZATION: basic ${basicCredential}`
    )
    await fs.promises.writeFile(configPath, content)
  }

  private async removeToken(): Promise<void> {
    // HTTP extra header
    await this.removeGitConfig(EXTRA_HEADER_KEY)
  }

  private async removeGitConfig(configKey: string): Promise<void> {
    if (
      (await this.git.configExists(configKey)) &&
      !(await this.git.tryConfigUnset(configKey))
    ) {
      // Load the config contents
      core.warning(`Failed to remove '${configKey}' from the git config`)
    }
  }
}
