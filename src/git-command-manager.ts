import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as fshelper from './fs-helper'
import * as io from '@actions/io'
import * as path from 'path'
import * as refHelper from './ref-helper'
import * as regexpHelper from './regexp-helper'
import * as retryHelper from './retry-helper'
import {GitVersion} from './git-version'

// Auth header not supported before 2.9
// Wire protocol v2 not supported before 2.18
export const MinimumGitVersion = new GitVersion('2.18')

export interface IGitCommandManager {
  branchDelete(remote: boolean, branch: string): Promise<void>
  branchExists(remote: boolean, pattern: string): Promise<boolean>
  branchList(remote: boolean): Promise<string[]>
  sparseCheckout(sparseCheckout: string[]): Promise<void>
  sparseCheckoutNonConeMode(sparseCheckout: string[]): Promise<void>
  checkout(ref: string, startPoint: string): Promise<void>
  checkoutDetach(): Promise<void>
  config(
    configKey: string,
    configValue: string,
    globalConfig?: boolean,
    add?: boolean
  ): Promise<void>
  configExists(configKey: string, globalConfig?: boolean): Promise<boolean>
  fetch(
    refSpec: string[],
    options: {
      filter?: string
      fetchDepth?: number
      fetchTags?: boolean
    }
  ): Promise<void>
  getDefaultBranch(repositoryUrl: string): Promise<string>
  getWorkingDirectory(): string
  init(): Promise<void>
  isDetached(): Promise<boolean>
  lfsFetch(ref: string): Promise<void>
  lfsInstall(): Promise<void>
  log1(format?: string): Promise<string>
  remoteAdd(remoteName: string, remoteUrl: string): Promise<void>
  removeEnvironmentVariable(name: string): void
  revParse(ref: string): Promise<string>
  setEnvironmentVariable(name: string, value: string): void
  shaExists(sha: string): Promise<boolean>
  submoduleForeach(command: string, recursive: boolean): Promise<string>
  submoduleSync(recursive: boolean): Promise<void>
  submoduleUpdate(fetchDepth: number, recursive: boolean): Promise<void>
  submoduleStatus(): Promise<boolean>
  tagExists(pattern: string): Promise<boolean>
  tryClean(): Promise<boolean>
  tryConfigUnset(configKey: string, globalConfig?: boolean): Promise<boolean>
  tryDisableAutomaticGarbageCollection(): Promise<boolean>
  tryGetFetchUrl(): Promise<string>
  tryReset(): Promise<boolean>
}

export async function createCommandManager(
  workingDirectory: string,
  lfs: boolean,
  doSparseCheckout: boolean
): Promise<IGitCommandManager> {
  return await GitCommandManager.createCommandManager(
    workingDirectory,
    lfs,
    doSparseCheckout
  )
}

class GitCommandManager {
  private gitEnv = {
    GIT_TERMINAL_PROMPT: '0', // Disable git prompt
    GCM_INTERACTIVE: 'Never' // Disable prompting for git credential manager
  }
  private gitPath = ''
  private lfs = false
  private doSparseCheckout = false
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

    // TODO(https://github.com/actions/checkout/issues/786): this implementation uses
    // "rev-parse --symbolic-full-name" because there is a bug
    // in Git 2.18 that causes "rev-parse --symbolic" to output symbolic full names. When
    // 2.18 is no longer supported, we can switch back to --symbolic.

    const args = ['rev-parse', '--symbolic-full-name']
    if (remote) {
      args.push('--remotes=origin')
    } else {
      args.push('--branches')
    }

    const stderr: string[] = []
    const errline: string[] = []
    const stdout: string[] = []
    const stdline: string[] = []

    const listeners = {
      stderr: (data: Buffer) => {
        stderr.push(data.toString())
      },
      errline: (data: Buffer) => {
        errline.push(data.toString())
      },
      stdout: (data: Buffer) => {
        stdout.push(data.toString())
      },
      stdline: (data: Buffer) => {
        stdline.push(data.toString())
      }
    }

    // Suppress the output in order to avoid flooding annotations with innocuous errors.
    await this.execGit(args, false, true, listeners)

    core.debug(`stderr callback is: ${stderr}`)
    core.debug(`errline callback is: ${errline}`)
    core.debug(`stdout callback is: ${stdout}`)
    core.debug(`stdline callback is: ${stdline}`)

    for (let branch of stdline) {
      branch = branch.trim()
      if (!branch) {
        continue
      }

      if (branch.startsWith('refs/heads/')) {
        branch = branch.substring('refs/heads/'.length)
      } else if (branch.startsWith('refs/remotes/')) {
        branch = branch.substring('refs/remotes/'.length)
      }

      result.push(branch)
    }

    return result
  }

  async sparseCheckout(sparseCheckout: string[]): Promise<void> {
    await this.execGit(['sparse-checkout', 'set', ...sparseCheckout])
  }

  async sparseCheckoutNonConeMode(sparseCheckout: string[]): Promise<void> {
    await this.execGit(['config', 'core.sparseCheckout', 'true'])
    const output = await this.execGit([
      'rev-parse',
      '--git-path',
      'info/sparse-checkout'
    ])
    const sparseCheckoutPath = path.join(
      this.workingDirectory,
      output.stdout.trimRight()
    )
    await fs.promises.appendFile(
      sparseCheckoutPath,
      `\n${sparseCheckout.join('\n')}\n`
    )
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

  async config(
    configKey: string,
    configValue: string,
    globalConfig?: boolean,
    add?: boolean
  ): Promise<void> {
    const args: string[] = ['config', globalConfig ? '--global' : '--local']
    if (add) {
      args.push('--add')
    }
    args.push(...[configKey, configValue])
    await this.execGit(args)
  }

  async configExists(
    configKey: string,
    globalConfig?: boolean
  ): Promise<boolean> {
    const pattern = regexpHelper.escape(configKey)
    const output = await this.execGit(
      [
        'config',
        globalConfig ? '--global' : '--local',
        '--name-only',
        '--get-regexp',
        pattern
      ],
      true
    )
    return output.exitCode === 0
  }

  async fetch(
    refSpec: string[],
    options: {filter?: string; fetchDepth?: number; fetchTags?: boolean}
  ): Promise<void> {
    const args = ['-c', 'protocol.version=2', 'fetch']
    if (!refSpec.some(x => x === refHelper.tagsRefSpec) && !options.fetchTags) {
      args.push('--no-tags')
    }

    args.push('--prune', '--progress', '--no-recurse-submodules')

    if (options.filter) {
      args.push(`--filter=${options.filter}`)
    }

    if (options.fetchDepth && options.fetchDepth > 0) {
      args.push(`--depth=${options.fetchDepth}`)
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

  async getDefaultBranch(repositoryUrl: string): Promise<string> {
    let output: GitOutput | undefined
    await retryHelper.execute(async () => {
      output = await this.execGit([
        'ls-remote',
        '--quiet',
        '--exit-code',
        '--symref',
        repositoryUrl,
        'HEAD'
      ])
    })

    if (output) {
      // Satisfy compiler, will always be set
      for (let line of output.stdout.trim().split('\n')) {
        line = line.trim()
        if (line.startsWith('ref:') || line.endsWith('HEAD')) {
          return line
            .substr('ref:'.length, line.length - 'ref:'.length - 'HEAD'.length)
            .trim()
        }
      }
    }

    throw new Error('Unexpected output when retrieving default branch')
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

  async log1(format?: string): Promise<string> {
    const args = format ? ['log', '-1', format] : ['log', '-1']
    const silent = format ? false : true
    const output = await this.execGit(args, false, silent)
    return output.stdout
  }

  async remoteAdd(remoteName: string, remoteUrl: string): Promise<void> {
    await this.execGit(['remote', 'add', remoteName, remoteUrl])
  }

  removeEnvironmentVariable(name: string): void {
    delete this.gitEnv[name]
  }

  /**
   * Resolves a ref to a SHA. For a branch or lightweight tag, the commit SHA is returned.
   * For an annotated tag, the tag SHA is returned.
   * @param {string} ref  For example: 'refs/heads/main' or '/refs/tags/v1'
   * @returns {Promise<string>}
   */
  async revParse(ref: string): Promise<string> {
    const output = await this.execGit(['rev-parse', ref])
    return output.stdout.trim()
  }

  setEnvironmentVariable(name: string, value: string): void {
    this.gitEnv[name] = value
  }

  async shaExists(sha: string): Promise<boolean> {
    const args = ['rev-parse', '--verify', '--quiet', `${sha}^{object}`]
    const output = await this.execGit(args, true)
    return output.exitCode === 0
  }

  async submoduleForeach(command: string, recursive: boolean): Promise<string> {
    const args = ['submodule', 'foreach']
    if (recursive) {
      args.push('--recursive')
    }
    args.push(command)

    const output = await this.execGit(args)
    return output.stdout
  }

  async submoduleSync(recursive: boolean): Promise<void> {
    const args = ['submodule', 'sync']
    if (recursive) {
      args.push('--recursive')
    }

    await this.execGit(args)
  }

  async submoduleUpdate(fetchDepth: number, recursive: boolean): Promise<void> {
    const args = ['-c', 'protocol.version=2']
    args.push('submodule', 'update', '--init', '--force')
    if (fetchDepth > 0) {
      args.push(`--depth=${fetchDepth}`)
    }

    if (recursive) {
      args.push('--recursive')
    }

    await this.execGit(args)
  }

  async submoduleStatus(): Promise<boolean> {
    const output = await this.execGit(['submodule', 'status'], true)
    core.debug(output.stdout)
    return output.exitCode === 0
  }

  async tagExists(pattern: string): Promise<boolean> {
    const output = await this.execGit(['tag', '--list', pattern])
    return !!output.stdout.trim()
  }

  async tryClean(): Promise<boolean> {
    const output = await this.execGit(['clean', '-ffdx'], true)
    return output.exitCode === 0
  }

  async tryConfigUnset(
    configKey: string,
    globalConfig?: boolean
  ): Promise<boolean> {
    const output = await this.execGit(
      [
        'config',
        globalConfig ? '--global' : '--local',
        '--unset-all',
        configKey
      ],
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
    lfs: boolean,
    doSparseCheckout: boolean
  ): Promise<GitCommandManager> {
    const result = new GitCommandManager()
    await result.initializeCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )
    return result
  }

  private async execGit(
    args: string[],
    allowAllExitCodes = false,
    silent = false,
    customListeners = {}
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

    const defaultListener = {
      stdout: (data: Buffer) => {
        stdout.push(data.toString())
      }
    }

    const mergedListeners = {...defaultListener, ...customListeners}

    const stdout: string[] = []
    const options = {
      cwd: this.workingDirectory,
      env,
      silent,
      ignoreReturnCode: allowAllExitCodes,
      listeners: mergedListeners
    }

    result.exitCode = await exec.exec(`"${this.gitPath}"`, args, options)
    result.stdout = stdout.join('')

    core.debug(result.exitCode.toString())
    core.debug(result.stdout)

    return result
  }

  private async initializeCommandManager(
    workingDirectory: string,
    lfs: boolean,
    doSparseCheckout: boolean
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

    this.doSparseCheckout = doSparseCheckout
    if (this.doSparseCheckout) {
      // The `git sparse-checkout` command was introduced in Git v2.25.0
      const minimumGitSparseCheckoutVersion = new GitVersion('2.25')
      if (!gitVersion.checkMinimum(minimumGitSparseCheckoutVersion)) {
        throw new Error(
          `Minimum Git version required for sparse checkout is ${minimumGitSparseCheckoutVersion}. Your git ('${this.gitPath}') is ${gitVersion}`
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
