import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fshelper from './fs-helper'
import * as io from '@actions/io'
import * as path from 'path'
import * as retryHelper from './retry-helper'
import {GitVersion} from './git-version'

// Auth header not supported before 2.9
// Wire protocol v2 not supported before 2.18
export const MinimumGitVersion = new GitVersion('2.18')

export interface IGitCommandManager {
  branchDelete(remote: boolean, branch: string): Promise<void>
  branchExists(remote: boolean, pattern: string): Promise<boolean>
  branchList(remote: boolean): Promise<string[]>
  checkout(ref: string, startPoint: string): Promise<void>
  checkoutDetach(): Promise<void>
  config(configKey: string, configValue: string): Promise<void>
  configExists(configKey: string): Promise<boolean>
  fetch(fetchDepth: number, refSpec: string[]): Promise<void>
  getWorkingDirectory(): string
  init(): Promise<void>
  isDetached(): Promise<boolean>
  lfsFetch(ref: string): Promise<void>
  lfsInstall(): Promise<void>
  log1(): Promise<void>
  remoteAdd(remoteName: string, remoteUrl: string): Promise<void>
  tagExists(pattern: string): Promise<boolean>
  tryClean(): Promise<boolean>
  tryConfigUnset(configKey: string): Promise<boolean>
  tryDisableAutomaticGarbageCollection(): Promise<boolean>
  tryGetFetchUrl(): Promise<string>
  tryReset(): Promise<boolean>
}

export async function CreateCommandManager(
  workingDirectory: string,
  lfs: boolean
): Promise<IGitCommandManager> {
  return await GitCommandManager.createCommandManager(workingDirectory, lfs)
}

class GitCommandManager {
  private gitEnv = {
    GIT_TERMINAL_PROMPT: '0', // Disable git prompt
    GCM_INTERACTIVE: 'Never' // Disable prompting for git credential manager
  }
  private gitPath = ''
  private lfs = false
  private workingDirectory = ''

  // Private constructor; use createCommandManager()
  private constructor() {}

  async branchDelete(remote: boolean, branch: string): Promise<void> {
    const args = ['branch', '--delete', '--force']
    if (remote) {
      args.push('--remote')
    }
    args.push(branch)

    await this.execGit(args)
  }

  async branchExists(remote: boolean, pattern: string): Promise<boolean> {
    const args = ['branch', '--list']
    if (remote) {
      args.push('--remote')
    }
    args.push(pattern)

    const output = await this.execGit(args)
    return !!output.stdout.trim()
  }

  async branchList(remote: boolean): Promise<string[]> {
    const result: string[] = []

    // Note, this implementation uses "rev-parse --symbolic-full-name" because the output from
    // "branch --list" is more difficult when in a detached HEAD state.
    // Note, this implementation uses "rev-parse --symbolic-full-name" because there is a bug
    // in Git 2.18 that causes "rev-parse --symbolic" to output symbolic full names.

    const args = ['rev-parse', '--symbolic-full-name']
    if (remote) {
      args.push('--remotes=origin')
    } else {
      args.push('--branches')
    }

    const output = await this.execGit(args)

    for (let branch of output.stdout.trim().split('\n')) {
      branch = branch.trim()
      if (branch) {
        if (branch.startsWith('refs/heads/')) {
          branch = branch.substr('refs/heads/'.length)
        } else if (branch.startsWith('refs/remotes/')) {
          branch = branch.substr('refs/remotes/'.length)
        }

        result.push(branch)
      }
    }

    return result
  }

  async checkout(ref: string, startPoint: string): Promise<void> {
    const args = ['checkout', '--progress', '--force']
    if (startPoint) {
      args.push('-B', ref, startPoint)
    } else {
      args.push(ref)
    }

    await this.execGit(args)
  }

  async checkoutDetach(): Promise<void> {
    const args = ['checkout', '--detach']
    await this.execGit(args)
  }

  async config(configKey: string, configValue: string): Promise<void> {
    await this.execGit(['config', '--local', configKey, configValue])
  }

  async configExists(configKey: string): Promise<boolean> {
    const pattern = configKey.replace(/[^a-zA-Z0-9_]/g, x => {
      return `\\${x}`
    })
    const output = await this.execGit(
      ['config', '--local', '--name-only', '--get-regexp', pattern],
      true
    )
    return output.exitCode === 0
  }

  async fetch(fetchDepth: number, refSpec: string[]): Promise<void> {
    const args = [
      '-c',
      'protocol.version=2',
      'fetch',
      '--no-tags',
      '--prune',
      '--progress',
      '--no-recurse-submodules'
    ]
    if (fetchDepth > 0) {
      args.push(`--depth=${fetchDepth}`)
    } else if (
      fshelper.fileExistsSync(
        path.join(this.workingDirectory, '.git', 'shallow')
      )
    ) {
      args.push('--unshallow')
    }

    args.push('origin')
    for (const arg of refSpec) {
      args.push(arg)
    }

    const that = this
    await retryHelper.execute(async () => {
      await that.execGit(args)
    })
  }

  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  async init(): Promise<void> {
    await this.execGit(['init', this.workingDirectory])
  }

  async isDetached(): Promise<boolean> {
    // Note, "branch --show-current" would be simpler but isn't available until Git 2.22
    const output = await this.execGit(
      ['rev-parse', '--symbolic-full-name', '--verify', '--quiet', 'HEAD'],
      true
    )
    return !output.stdout.trim().startsWith('refs/heads/')
  }

  async lfsFetch(ref: string): Promise<void> {
    const args = ['lfs', 'fetch', 'origin', ref]

    const that = this
    await retryHelper.execute(async () => {
      await that.execGit(args)
    })
  }

  async lfsInstall(): Promise<void> {
    await this.execGit(['lfs', 'install', '--local'])
  }

  async log1(): Promise<void> {
    await this.execGit(['log', '-1'])
  }

  async remoteAdd(remoteName: string, remoteUrl: string): Promise<void> {
    await this.execGit(['remote', 'add', remoteName, remoteUrl])
  }

  async tagExists(pattern: string): Promise<boolean> {
    const output = await this.execGit(['tag', '--list', pattern])
    return !!output.stdout.trim()
  }

  async tryClean(): Promise<boolean> {
    const output = await this.execGit(['clean', '-ffdx'], true)
    return output.exitCode === 0
  }

  async tryConfigUnset(configKey: string): Promise<boolean> {
    const output = await this.execGit(
      ['config', '--local', '--unset-all', configKey],
      true
    )
    return output.exitCode === 0
  }

  async tryDisableAutomaticGarbageCollection(): Promise<boolean> {
    const output = await this.execGit(
      ['config', '--local', 'gc.auto', '0'],
      true
    )
    return output.exitCode === 0
  }

  async tryGetFetchUrl(): Promise<string> {
    const output = await this.execGit(
      ['config', '--local', '--get', 'remote.origin.url'],
      true
    )

    if (output.exitCode !== 0) {
      return ''
    }

    const stdout = output.stdout.trim()
    if (stdout.includes('\n')) {
      return ''
    }

    return stdout
  }

  async tryReset(): Promise<boolean> {
    const output = await this.execGit(['reset', '--hard', 'HEAD'], true)
    return output.exitCode === 0
  }

  static async createCommandManager(
    workingDirectory: string,
    lfs: boolean
  ): Promise<GitCommandManager> {
    const result = new GitCommandManager()
    await result.initializeCommandManager(workingDirectory, lfs)
    return result
  }

  private async execGit(
    args: string[],
    allowAllExitCodes = false
  ): Promise<GitOutput> {
    fshelper.directoryExistsSync(this.workingDirectory, true)

    const result = new GitOutput()

    const env = {}
    for (const key of Object.keys(process.env)) {
      env[key] = process.env[key]
    }
    for (const key of Object.keys(this.gitEnv)) {
      env[key] = this.gitEnv[key]
    }

    const stdout: string[] = []

    const options = {
      cwd: this.workingDirectory,
      env,
      ignoreReturnCode: allowAllExitCodes,
      listeners: {
        stdout: (data: Buffer) => {
          stdout.push(data.toString())
        }
      }
    }

    result.exitCode = await exec.exec(`"${this.gitPath}"`, args, options)
    result.stdout = stdout.join('')
    return result
  }

  private async initializeCommandManager(
    workingDirectory: string,
    lfs: boolean
  ): Promise<void> {
    this.workingDirectory = workingDirectory

    // Git-lfs will try to pull down assets if any of the local/user/system setting exist.
    // If the user didn't enable `LFS` in their pipeline definition, disable LFS fetch/checkout.
    this.lfs = lfs
    if (!this.lfs) {
      this.gitEnv['GIT_LFS_SKIP_SMUDGE'] = '1'
    }

    this.gitPath = await io.which('git', true)

    // Git version
    core.debug('Getting git version')
    let gitVersion = new GitVersion()
    let gitOutput = await this.execGit(['version'])
    let stdout = gitOutput.stdout.trim()
    if (!stdout.includes('\n')) {
      const match = stdout.match(/\d+\.\d+(\.\d+)?/)
      if (match) {
        gitVersion = new GitVersion(match[0])
      }
    }
    if (!gitVersion.isValid()) {
      throw new Error('Unable to determine git version')
    }

    // Minimum git version
    if (!gitVersion.checkMinimum(MinimumGitVersion)) {
      throw new Error(
        `Minimum required git version is ${MinimumGitVersion}. Your git ('${this.gitPath}') is ${gitVersion}`
      )
    }

    if (this.lfs) {
      // Git-lfs version
      core.debug('Getting git-lfs version')
      let gitLfsVersion = new GitVersion()
      const gitLfsPath = await io.which('git-lfs', true)
      gitOutput = await this.execGit(['lfs', 'version'])
      stdout = gitOutput.stdout.trim()
      if (!stdout.includes('\n')) {
        const match = stdout.match(/\d+\.\d+(\.\d+)?/)
        if (match) {
          gitLfsVersion = new GitVersion(match[0])
        }
      }
      if (!gitLfsVersion.isValid()) {
        throw new Error('Unable to determine git-lfs version')
      }

      // Minimum git-lfs version
      // Note:
      // - Auth header not supported before 2.1
      const minimumGitLfsVersion = new GitVersion('2.1')
      if (!gitLfsVersion.checkMinimum(minimumGitLfsVersion)) {
        throw new Error(
          `Minimum required git-lfs version is ${minimumGitLfsVersion}. Your git-lfs ('${gitLfsPath}') is ${gitLfsVersion}`
        )
      }
    }

    // Set the user agent
    const gitHttpUserAgent = `git/${gitVersion} (github-actions-checkout)`
    core.debug(`Set git useragent to: ${gitHttpUserAgent}`)
    this.gitEnv['GIT_HTTP_USER_AGENT'] = gitHttpUserAgent
  }
}

class GitOutput {
  stdout = ''
  exitCode = 0
}
