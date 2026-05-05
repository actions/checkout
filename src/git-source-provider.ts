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
        settings.ref,
        settings.preserveLocalChanges
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

    // Initialize the repository
    if (
      !fsHelper.directoryExistsSync(path.join(settings.repositoryPath, '.git'))
    ) {
      core.startGroup('Initializing the repository')
      await git.init()
      await git.remoteAdd('origin', repositoryUrl)
      core.endGroup()
    }

    // Disable automatic garbage collection
    core.startGroup('Disabling automatic garbage collection')
    if (!(await git.tryDisableAutomaticGarbageCollection())) {
      core.warning(
        `Unable to turn off git automatic garbage collection. The git fetch operation may trigger garbage collection and cause a delay.`
      )
    }
    core.endGroup()

    // If we didn't initialize it above, do it now
    if (!authHelper) {
      authHelper = gitAuthHelper.createAuthHelper(git, settings)
    }
    // Configure auth
    core.startGroup('Setting up auth')
    await authHelper.configureAuth()
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
    if (settings.preserveLocalChanges) {
      core.info('Attempting to preserve local changes during checkout')

      // List and store local files before checkout
      const fs = require('fs')
      const path = require('path')
      const localFiles = new Map()

      try {
        // Get all files in the workspace that aren't in the .git directory
        const workspacePath = process.cwd()
        core.info(`Current workspace path: ${workspacePath}`)

        // List all files in the current directory using fs
        const listFilesRecursively = (dir: string): string[] => {
          let results: string[] = []
          const list = fs.readdirSync(dir)
          list.forEach((file: string) => {
            const fullPath = path.join(dir, file)
            const relativePath = path.relative(workspacePath, fullPath)
            // Skip .git directory
            if (relativePath.startsWith('.git')) return

            const stat = fs.statSync(fullPath)
            if (stat && stat.isDirectory()) {
              // Recursively explore subdirectories
              results = results.concat(listFilesRecursively(fullPath))
            } else {
              // Store file content in memory
              try {
                const content = fs.readFileSync(fullPath)
                localFiles.set(relativePath, content)
                results.push(relativePath)
              } catch (readErr) {
                core.warning(`Failed to read file ${relativePath}: ${readErr}`)
              }
            }
          })
          return results
        }

        const localFilesList = listFilesRecursively(workspacePath)
        core.info(`Found ${localFilesList.length} local files to preserve:`)
        localFilesList.forEach(file => core.info(`  - ${file}`))
      } catch (error) {
        core.warning(`Failed to list local files: ${error}`)
      }

      // Perform normal checkout
      await git.checkout(checkoutInfo.ref, checkoutInfo.startPoint)

      // Restore local files that were not tracked by git
      core.info('Restoring local files after checkout')
      try {
        let restoredCount = 0
        const execOptions = {
          cwd: process.cwd(),
          silent: true,
          ignoreReturnCode: true
        }

        for (const [filePath, content] of localFiles.entries()) {
          // Check if file exists in git using a child process instead of git.execGit
          const {exec} = require('@actions/exec')
          let exitCode = 0
          const output = {
            stdout: '',
            stderr: ''
          }

          // Capture output
          const options = {
            ...execOptions,
            listeners: {
              stdout: (data: Buffer) => {
                output.stdout += data.toString()
              },
              stderr: (data: Buffer) => {
                output.stderr += data.toString()
              }
            }
          }

          exitCode = await exec(
            'git',
            ['ls-files', '--error-unmatch', filePath],
            options
          )

          if (exitCode !== 0) {
            // File is not tracked by git, safe to restore
            const fullPath = path.join(process.cwd(), filePath)
            // Ensure directory exists
            fs.mkdirSync(path.dirname(fullPath), {recursive: true})
            fs.writeFileSync(fullPath, content)
            core.info(`Restored local file: ${filePath}`)
            restoredCount++
          } else {
            core.info(`Skipping ${filePath} as it's tracked by git`)
          }
        }
        core.info(`Successfully restored ${restoredCount} local files`)
      } catch (error) {
        core.warning(`Failed to restore local files: ${error}`)
      }
    } else {
      // Use the default behavior with --force
      await git.checkout(checkoutInfo.ref, checkoutInfo.startPoint)
    }
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
      await git.submoduleUpdate(settings.fetchDepth, settings.nestedSubmodules)
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
