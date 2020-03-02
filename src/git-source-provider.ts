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
import {IGitCommandManager} from './git-command-manager'
import {IGitSourceSettings} from './git-source-settings'

const hostname = 'github.com'

export async function getSource(settings: IGitSourceSettings): Promise<void> {
  // Repository URL
  core.info(
    `Syncing repository: ${settings.repositoryOwner}/${settings.repositoryName}`
  )
  const repositoryUrl = `https://${hostname}/${encodeURIComponent(
    settings.repositoryOwner
  )}/${encodeURIComponent(settings.repositoryName)}`

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
  const git = await getGitCommandManager(settings)

  // Prepare existing directory, otherwise recreate
  if (isExisting) {
    await gitDirectoryHelper.prepareExistingDirectory(
      git,
      settings.repositoryPath,
      repositoryUrl,
      settings.clean
    )
  }

  if (!git) {
    // Downloading using REST API
    core.info(`The repository will be downloaded using the GitHub REST API`)
    core.info(
      `To create a local Git repository instead, add Git ${gitCommandManager.MinimumGitVersion} or higher to the PATH`
    )
    await githubApiHelper.downloadRepository(
      settings.authToken,
      settings.repositoryOwner,
      settings.repositoryName,
      settings.ref,
      settings.commit,
      settings.repositoryPath
    )
  } else {
    // Save state for POST action
    stateHelper.setRepositoryPath(settings.repositoryPath)

    // Initialize the repository
    if (
      !fsHelper.directoryExistsSync(path.join(settings.repositoryPath, '.git'))
    ) {
      await git.init()
      await git.remoteAdd('origin', repositoryUrl)
    }

    // Disable automatic garbage collection
    if (!(await git.tryDisableAutomaticGarbageCollection())) {
      core.warning(
        `Unable to turn off git automatic garbage collection. The git fetch operation may trigger garbage collection and cause a delay.`
      )
    }

    const authHelper = gitAuthHelper.createAuthHelper(git, settings)
    try {
      // Configure auth
      await authHelper.configureAuth()

      // LFS install
      if (settings.lfs) {
        await git.lfsInstall()
      }

      // Fetch
      const refSpec = refHelper.getRefSpec(settings.ref, settings.commit)
      await git.fetch(settings.fetchDepth, refSpec)

      // Checkout info
      const checkoutInfo = await refHelper.getCheckoutInfo(
        git,
        settings.ref,
        settings.commit
      )

      // LFS fetch
      // Explicit lfs-fetch to avoid slow checkout (fetches one lfs object at a time).
      // Explicit lfs fetch will fetch lfs objects in parallel.
      if (settings.lfs) {
        await git.lfsFetch(checkoutInfo.startPoint || checkoutInfo.ref)
      }

      // Checkout
      await git.checkout(checkoutInfo.ref, checkoutInfo.startPoint)

      // Dump some info about the checked out commit
      await git.log1()
    } finally {
      // Remove auth
      if (!settings.persistCredentials) {
        await authHelper.removeAuth()
      }
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
    git = await gitCommandManager.createCommandManager(repositoryPath, false)
  } catch {
    return
  }

  // Remove auth
  const authHelper = gitAuthHelper.createAuthHelper(git)
  await authHelper.removeAuth()
}

async function getGitCommandManager(
  settings: IGitSourceSettings
): Promise<IGitCommandManager | undefined> {
  core.info(`Working directory is '${settings.repositoryPath}'`)
  try {
    return await gitCommandManager.createCommandManager(
      settings.repositoryPath,
      settings.lfs
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
