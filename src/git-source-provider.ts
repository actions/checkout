import * as core from '@actions/core'
import * as fsHelper from './fs-helper'
import * as gitAuthHelper from './git-auth-helper'
import * as gitCommandManager from './git-command-manager'
import * as gitDirectoryHelper from './git-directory-helper'
import * as githubApiHelper from './github-api-helper'
import * as io from '@actions/io'
import * as path from 'path'
import * as refHelper from './ref-helper'
import * as stateHelper from './state-helper'
import * as urlHelper from './url-helper'
import {
  MinimumGitSparseCheckoutVersion,
  IGitCommandManager
} from './git-command-manager'
import {IGitSourceSettings} from './git-source-settings'
import {GitCacheHelper} from './git-cache-helper'
import * as fs from 'fs'

interface SubmoduleInfo {
  name: string
  path: string
  url: string
}

export async function setupReferenceCache(
  git: IGitCommandManager,
  referenceCache: string,
  repositoryUrl: string
): Promise<void> {
  if (!referenceCache) {
    return
  }

  core.startGroup('Setting up reference repository cache')
  try {
    const cacheHelper = new GitCacheHelper(referenceCache)
    const cachePath = await cacheHelper.setupCache(git, repositoryUrl)
    const cacheObjects = path.join(cachePath, 'objects')
    if (fsHelper.directoryExistsSync(cacheObjects, false)) {
      await git.referenceAdd(cacheObjects)
    } else {
      core.warning(
        `Reference repository cache objects directory ${cacheObjects} does not exist`
      )
    }
  } finally {
    core.endGroup()
  }
}

async function recursiveSubmoduleUpdate(
  git: IGitCommandManager,
  cacheHelper: GitCacheHelper,
  repositoryPath: string,
  fetchDepth: number,
  nestedSubmodules: boolean
): Promise<void> {
  const gitmodulesPath = path.join(repositoryPath, '.gitmodules')
  if (!fs.existsSync(gitmodulesPath)) {
    return
  }

  const submodules = new Map<string, SubmoduleInfo>()

  // Get all submodule config keys
  try {
    const output = await git.execGit([
      '-C', repositoryPath,
      'config', '--file', gitmodulesPath, '--get-regexp', 'submodule\\..*'
    ], true, true)

    const lines = output.stdout.split('\n').filter(l => l.trim().length > 0)
    for (const line of lines) {
      const match = line.match(/^submodule\.(.+?)\.(path|url)\s+(.*)$/)
      if (match) {
        const [, name, key, value] = match
        if (!submodules.has(name)) {
          submodules.set(name, { name, path: '', url: '' })
        }
        const info = submodules.get(name)!
        if (key === 'path') info.path = value
        if (key === 'url') info.url = value
      }
    }
  } catch (err) {
    core.warning(`Failed to read .gitmodules: ${err}`)
    return
  }

  for (const info of submodules.values()) {
    if (!info.path || !info.url) continue

    core.info(`Processing submodule ${info.name} at ${info.path}`)
    
    // Resolve relative URLs or valid URLs
    let subUrl = info.url
    if (subUrl.startsWith('../') || subUrl.startsWith('./')) {
      // In checkout action, relative URLs are handled automatically by git.
      // But for our bare cache clone, we need an absolute URL.
      let originUrl = ''
      try {
        const originOut = await git.execGit(['-C', repositoryPath, 'remote', 'get-url', 'origin'], true, true)
        if (originOut.exitCode === 0) {
          originUrl = originOut.stdout.trim()
        }
        
        if (originUrl) {
          try {
            if (originUrl.match(/^https?:\/\//)) {
              // Using Node's URL class to resolve relative paths for HTTP(s)
              const parsedOrigin = new URL(originUrl.replace(/\.git$/, ''))
              const resolvedUrl = new URL(subUrl, parsedOrigin.href + '/')
              subUrl = resolvedUrl.href
            } else {
              // Fallback for SSH URLs which new URL() cannot parse (e.g. git@github.com:org/repo)
              let originParts = originUrl.replace(/\.git$/, '').split('/')
              originParts.pop() // remove current repo
              
              // Handle multiple ../
              let subTarget = subUrl
              while (subTarget.startsWith('../')) {
                if (originParts.length === 0) break // Can't go higher
                originParts.pop()
                subTarget = subTarget.substring(3)
              }
              if (subTarget.startsWith('./')) {
                subTarget = subTarget.substring(2)
              }
              
              if (originParts.length > 0) {
                subUrl = originParts.join('/') + '/' + subTarget
              }
            }
          } catch {
            // Fallback does not work
          }
        }
      } catch {
        // ignore
      }
    }

    if (!subUrl || subUrl.startsWith('../') || subUrl.startsWith('./')) {
      core.warning(`Could not resolve absolute URL for submodule ${info.name}. Falling back to standard clone.`)
      await invokeStandardSubmoduleUpdate(git, repositoryPath, fetchDepth, info.path)
      continue
    }

    try {
      // Prepare cache
      const cachePath = await cacheHelper.setupCache(git, subUrl)
      
      // Submodule update for this specific one
      const args = ['-C', repositoryPath, '-c', 'protocol.version=2', 'submodule', 'update', '--init', '--force']
      if (fetchDepth > 0) {
        args.push(`--depth=${fetchDepth}`)
      }
      args.push('--reference', cachePath)
      args.push(info.path)

      const output = await git.execGit(args, true)
      if (output.exitCode !== 0) {
        throw new Error(`Submodule update failed with exit code ${output.exitCode}`)
      }
    } catch (err) {
      core.warning(`Reference cache failed for submodule ${info.name} (${err}). Falling back to standard clone...`)
      await invokeStandardSubmoduleUpdate(git, repositoryPath, fetchDepth, info.path)
    }
    
    // Recursive update inside the submodule
    if (nestedSubmodules) {
      const subRepoPath = path.join(repositoryPath, info.path)
      await recursiveSubmoduleUpdate(
        git,
        cacheHelper,
        subRepoPath,
        fetchDepth,
        nestedSubmodules
      )
    }
  }
}

async function invokeStandardSubmoduleUpdate(git: IGitCommandManager, repositoryPath: string, fetchDepth: number, submodulePath: string) {
  const args = ['-C', repositoryPath, '-c', 'protocol.version=2', 'submodule', 'update', '--init', '--force']
  if (fetchDepth > 0) {
    args.push(`--depth=${fetchDepth}`)
  }
  args.push(submodulePath)
  await git.execGit(args)
}

export async function getSource(settings: IGitSourceSettings): Promise<void> {
  // Repository URL
  core.info(
    `Syncing repository: ${settings.repositoryOwner}/${settings.repositoryName}`
  )
  const repositoryUrl = urlHelper.getFetchUrl(settings)

  // Remove conflicting file path
  if (fsHelper.fileExistsSync(settings.repositoryPath)) {
    await io.rmRF(settings.repositoryPath)
  }

  // Create directory
  let isExisting = true
  if (!fsHelper.directoryExistsSync(settings.repositoryPath)) {
    isExisting = false
    await io.mkdirP(settings.repositoryPath)
  }

  // Git command manager
  core.startGroup('Getting Git version info')
  const git = await getGitCommandManager(settings)
  core.endGroup()

  let authHelper: gitAuthHelper.IGitAuthHelper | null = null
  try {
    if (git) {
      authHelper = gitAuthHelper.createAuthHelper(git, settings)
      if (settings.setSafeDirectory) {
        // Setup the repository path as a safe directory, so if we pass this into a container job with a different user it doesn't fail
        // Otherwise all git commands we run in a container fail
        await authHelper.configureTempGlobalConfig()
        core.info(
          `Adding repository directory to the temporary git global config as a safe directory`
        )

        await git
          .config('safe.directory', settings.repositoryPath, true, true)
          .catch(error => {
            core.info(
              `Failed to initialize safe directory with error: ${error}`
            )
          })

        stateHelper.setSafeDirectory()
      }
    }

    // Prepare existing directory, otherwise recreate
    if (isExisting) {
      await gitDirectoryHelper.prepareExistingDirectory(
        git,
        settings.repositoryPath,
        repositoryUrl,
        settings.clean,
        settings.ref
      )
    }

    if (!git) {
      // Downloading using REST API
      core.info(`The repository will be downloaded using the GitHub REST API`)
      core.info(
        `To create a local Git repository instead, add Git ${gitCommandManager.MinimumGitVersion} or higher to the PATH`
      )
      if (settings.submodules) {
        throw new Error(
          `Input 'submodules' not supported when falling back to download using the GitHub REST API. To create a local Git repository instead, add Git ${gitCommandManager.MinimumGitVersion} or higher to the PATH.`
        )
      } else if (settings.sshKey) {
        throw new Error(
          `Input 'ssh-key' not supported when falling back to download using the GitHub REST API. To create a local Git repository instead, add Git ${gitCommandManager.MinimumGitVersion} or higher to the PATH.`
        )
      }

      await githubApiHelper.downloadRepository(
        settings.authToken,
        settings.repositoryOwner,
        settings.repositoryName,
        settings.ref,
        settings.commit,
        settings.repositoryPath,
        settings.githubServerUrl
      )
      return
    }

    // Save state for POST action
    stateHelper.setRepositoryPath(settings.repositoryPath)

    // If we didn't initialize it above, do it now
    if (!authHelper) {
      authHelper = gitAuthHelper.createAuthHelper(git, settings)
    }

    // Check if we need global auth setup early for reference cache
    // Global auth does not require a local .git directory
    if (settings.referenceCache) {
      core.startGroup('Setting up global auth for reference cache')
      await authHelper.configureGlobalAuth()
      core.endGroup()
    }

    // Initialize the repository
    if (
      !fsHelper.directoryExistsSync(path.join(settings.repositoryPath, '.git'))
    ) {
      core.startGroup('Initializing the repository')
      await git.init()
      await git.remoteAdd('origin', repositoryUrl)
      core.endGroup()
    }

    await setupReferenceCache(git, settings.referenceCache, repositoryUrl)

    // Remove global auth if it was set for reference cache,
    // to avoid duplicate AUTHORIZATION headers during fetch
    if (settings.referenceCache) {
      core.startGroup('Removing global auth after reference cache setup')
      await authHelper.removeGlobalAuth()
      core.endGroup()
    }

    // Configure auth (must happen after git init so .git exists)
    core.startGroup('Setting up auth')
    await authHelper.configureAuth()
    core.endGroup()

    // Disable automatic garbage collection
    core.startGroup('Disabling automatic garbage collection')
    if (!(await git.tryDisableAutomaticGarbageCollection())) {
      core.warning(
        `Unable to turn off git automatic garbage collection. The git fetch operation may trigger garbage collection and cause a delay.`
      )
    }
    core.endGroup()

    // Determine the default branch
    if (!settings.ref && !settings.commit) {
      core.startGroup('Determining the default branch')
      if (settings.sshKey) {
        settings.ref = await git.getDefaultBranch(repositoryUrl)
      } else {
        settings.ref = await githubApiHelper.getDefaultBranch(
          settings.authToken,
          settings.repositoryOwner,
          settings.repositoryName,
          settings.githubServerUrl
        )
      }
      core.endGroup()
    }

    // LFS install
    if (settings.lfs) {
      await git.lfsInstall()
    }

    // When using reference cache, fetch-depth > 0 is counterproductive:
    // objects are served from the local cache, so shallow negotiation only adds latency.
    adjustFetchDepthForCache(settings)

    // Fetch
    core.startGroup('Fetching the repository')
    const fetchOptions: {
      filter?: string
      fetchDepth?: number
      showProgress?: boolean
    } = {}

    if (settings.filter) {
      fetchOptions.filter = settings.filter
    } else if (settings.sparseCheckout) {
      fetchOptions.filter = 'blob:none'
    }

    if (settings.fetchDepth <= 0) {
      // Fetch all branches and tags
      let refSpec = refHelper.getRefSpecForAllHistory(
        settings.ref,
        settings.commit
      )
      await git.fetch(refSpec, fetchOptions)

      // When all history is fetched, the ref we're interested in may have moved to a different
      // commit (push or force push). If so, fetch again with a targeted refspec.
      if (!(await refHelper.testRef(git, settings.ref, settings.commit))) {
        refSpec = refHelper.getRefSpec(settings.ref, settings.commit)
        await git.fetch(refSpec, fetchOptions)

        // Verify the ref now matches. For branches, the targeted fetch above brings
        // in the specific commit. For tags (fetched by ref), this will fail if
        // the tag was moved after the workflow was triggered.
        if (!(await refHelper.testRef(git, settings.ref, settings.commit))) {
          throw new Error(
            `The ref '${settings.ref}' does not point to the expected commit '${settings.commit}'. ` +
              `The ref may have been updated after the workflow was triggered.`
          )
        }
      }
    } else {
      fetchOptions.fetchDepth = settings.fetchDepth
      const refSpec = refHelper.getRefSpec(
        settings.ref,
        settings.commit,
        settings.fetchTags
      )
      await git.fetch(refSpec, fetchOptions)

      // For tags, verify the ref still points to the expected commit.
      // Tags are fetched by ref (not commit), so if a tag was moved after the
      // workflow was triggered, we would silently check out the wrong commit.
      if (!(await refHelper.testRef(git, settings.ref, settings.commit))) {
        throw new Error(
          `The ref '${settings.ref}' does not point to the expected commit '${settings.commit}'. ` +
            `The ref may have been updated after the workflow was triggered.`
        )
      }
    }
    core.endGroup()

    // Checkout info
    core.startGroup('Determining the checkout info')
    const checkoutInfo = await refHelper.getCheckoutInfo(
      git,
      settings.ref,
      settings.commit
    )
    core.endGroup()

    // LFS fetch
    // Explicit lfs-fetch to avoid slow checkout (fetches one lfs object at a time).
    // Explicit lfs fetch will fetch lfs objects in parallel.
    // For sparse checkouts, let `checkout` fetch the needed objects lazily.
    if (settings.lfs && !settings.sparseCheckout) {
      core.startGroup('Fetching LFS objects')
      await git.lfsFetch(checkoutInfo.startPoint || checkoutInfo.ref)
      core.endGroup()
    }

    // Sparse checkout
    if (!settings.sparseCheckout) {
      let gitVersion = await git.version()
      // no need to disable sparse-checkout if the installed git runtime doesn't even support it.
      if (gitVersion.checkMinimum(MinimumGitSparseCheckoutVersion)) {
        await git.disableSparseCheckout()
      }
    } else {
      core.startGroup('Setting up sparse checkout')
      if (settings.sparseCheckoutConeMode) {
        await git.sparseCheckout(settings.sparseCheckout)
      } else {
        await git.sparseCheckoutNonConeMode(settings.sparseCheckout)
      }
      core.endGroup()
    }

    // Checkout
    core.startGroup('Checking out the ref')
    await git.checkout(checkoutInfo.ref, checkoutInfo.startPoint)
    core.endGroup()

    // Submodules
    if (settings.submodules) {
      // Temporarily override global config
      core.startGroup('Setting up auth for fetching submodules')
      await authHelper.configureGlobalAuth()
      core.endGroup()

      // Checkout submodules
      core.startGroup('Fetching submodules')
      await git.submoduleSync(settings.nestedSubmodules)
      
      if (settings.referenceCache) {
        core.info('Recursive submodule update using reference cache')
        const cacheHelper = new GitCacheHelper(settings.referenceCache)
        await recursiveSubmoduleUpdate(
          git,
          cacheHelper,
          settings.repositoryPath,
          settings.fetchDepth,
          settings.nestedSubmodules
        )
      } else {
        await git.submoduleUpdate(settings.fetchDepth, settings.nestedSubmodules)
      }
      
      await git.submoduleForeach(
        'git config --local gc.auto 0',
        settings.nestedSubmodules
      )
      core.endGroup()

      // Persist credentials
      if (settings.persistCredentials) {
        core.startGroup('Persisting credentials for submodules')
        await authHelper.configureSubmoduleAuth()
        core.endGroup()
      }
    }

    // Get commit information
    const commitInfo = await git.log1()

    // Log commit sha
    const commitSHA = await git.log1('--format=%H')
    core.setOutput('commit', commitSHA.trim())

    // Check for incorrect pull request merge commit
    await refHelper.checkCommitInfo(
      settings.authToken,
      commitInfo,
      settings.repositoryOwner,
      settings.repositoryName,
      settings.ref,
      settings.commit,
      settings.githubServerUrl
    )
  } finally {
    // Remove auth
    if (authHelper) {
      if (!settings.persistCredentials) {
        core.startGroup('Removing auth')
        await authHelper.removeAuth()
        core.endGroup()
      }
      authHelper.removeGlobalConfig()
    }
  }
}

export async function cleanup(repositoryPath: string): Promise<void> {
  // Repo exists?
  if (
    !repositoryPath ||
    !fsHelper.fileExistsSync(path.join(repositoryPath, '.git', 'config'))
  ) {
    return
  }

  let git: IGitCommandManager
  try {
    git = await gitCommandManager.createCommandManager(
      repositoryPath,
      false,
      false
    )
  } catch {
    return
  }

  // Remove auth
  const authHelper = gitAuthHelper.createAuthHelper(git)
  try {
    if (stateHelper.PostSetSafeDirectory) {
      // Setup the repository path as a safe directory, so if we pass this into a container job with a different user it doesn't fail
      // Otherwise all git commands we run in a container fail
      await authHelper.configureTempGlobalConfig()
      core.info(
        `Adding repository directory to the temporary git global config as a safe directory`
      )

      await git
        .config('safe.directory', repositoryPath, true, true)
        .catch(error => {
          core.info(`Failed to initialize safe directory with error: ${error}`)
        })
    }

    await authHelper.removeAuth()
  } finally {
    await authHelper.removeGlobalConfig()
  }
}

async function getGitCommandManager(
  settings: IGitSourceSettings
): Promise<IGitCommandManager | undefined> {
  core.info(`Working directory is '${settings.repositoryPath}'`)
  try {
    return await gitCommandManager.createCommandManager(
      settings.repositoryPath,
      settings.lfs,
      settings.sparseCheckout != null
    )
  } catch (err) {
    // Git is required for LFS
    if (settings.lfs) {
      throw err
    }

    // Otherwise fallback to REST API
    return undefined
  }
}

/**
 * Adjusts fetchDepth when reference-cache is active.
 * Shallow fetches are counterproductive with a local cache because
 * objects are served from disk, making shallow negotiation pure overhead.
 */
export function adjustFetchDepthForCache(
  settings: Pick<
    IGitSourceSettings,
    'referenceCache' | 'fetchDepth' | 'fetchDepthExplicit'
  >
): void {
  if (settings.referenceCache && settings.fetchDepth > 0) {
    if (settings.fetchDepthExplicit) {
      core.warning(
        `'fetch-depth: ${settings.fetchDepth}' is set with reference-cache enabled. ` +
          `This may slow down checkout because shallow negotiation bypasses the local cache. ` +
          `Consider using 'fetch-depth: 0' for best performance with reference-cache.`
      )
    } else {
      core.info(
        `Overriding fetch-depth from ${settings.fetchDepth} to 0 because reference-cache is enabled`
      )
      settings.fetchDepth = 0
    }
  }
}
