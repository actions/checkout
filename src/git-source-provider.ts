import * as core from '@actions/core'
import * as fs from 'fs'
import * as fsHelper from './fs-helper'
import * as gitCommandManager from './git-command-manager'
import * as githubApiHelper from './github-api-helper'
import * as io from '@actions/io'
import * as path from 'path'
import * as refHelper from './ref-helper'
import * as stateHelper from './state-helper'
import {IGitCommandManager} from './git-command-manager'

const authConfigKey = `http.https://github.com/.extraheader`

export interface ISourceSettings {
  repositoryPath: string
  repositoryOwner: string
  repositoryName: string
  ref: string
  commit: string
  clean: boolean
  fetchDepth: number
  lfs: boolean
  authToken: string
  persistCredentials: boolean
}

export async function getSource(settings: ISourceSettings): Promise<void> {
  // Repository URL
  core.info(
    `Syncing repository: ${settings.repositoryOwner}/${settings.repositoryName}`
  )
  const repositoryUrl = `https://github.com/${encodeURIComponent(
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
    await prepareExistingDirectory(
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

    // Remove possible previous extraheader
    await removeGitConfig(git, authConfigKey)

    try {
      // Config auth token
      await configureAuthToken(git, settings.authToken)

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
      if (!settings.persistCredentials) {
        await removeGitConfig(git, authConfigKey)
      }
    }
  }
}

export async function cleanup(repositoryPath: string): Promise<void> {
  // Repo exists?
  if (!fsHelper.fileExistsSync(path.join(repositoryPath, '.git', 'config'))) {
    return
  }
  fsHelper.directoryExistsSync(repositoryPath, true)

  // Remove the config key
  const git = await gitCommandManager.CreateCommandManager(
    repositoryPath,
    false
  )
  await removeGitConfig(git, authConfigKey)
}

async function getGitCommandManager(
  settings: ISourceSettings
): Promise<IGitCommandManager> {
  core.info(`Working directory is '${settings.repositoryPath}'`)
  let git = (null as unknown) as IGitCommandManager
  try {
    return await gitCommandManager.CreateCommandManager(
      settings.repositoryPath,
      settings.lfs
    )
  } catch (err) {
    // Git is required for LFS
    if (settings.lfs) {
      throw err
    }

    // Otherwise fallback to REST API
    return (null as unknown) as IGitCommandManager
  }
}

async function prepareExistingDirectory(
  git: IGitCommandManager,
  repositoryPath: string,
  repositoryUrl: string,
  clean: boolean
): Promise<void> {
  let remove = false

  // Check whether using git or REST API
  if (!git) {
    remove = true
  }
  // Fetch URL does not match
  else if (
    !fsHelper.directoryExistsSync(path.join(repositoryPath, '.git')) ||
    repositoryUrl !== (await git.tryGetFetchUrl())
  ) {
    remove = true
  } else {
    // Delete any index.lock and shallow.lock left by a previously canceled run or crashed git process
    const lockPaths = [
      path.join(repositoryPath, '.git', 'index.lock'),
      path.join(repositoryPath, '.git', 'shallow.lock')
    ]
    for (const lockPath of lockPaths) {
      try {
        await io.rmRF(lockPath)
      } catch (error) {
        core.debug(`Unable to delete '${lockPath}'. ${error.message}`)
      }
    }

    try {
      // Checkout detached HEAD
      if (!(await git.isDetached())) {
        await git.checkoutDetach()
      }

      // Remove all refs/heads/*
      let branches = await git.branchList(false)
      for (const branch of branches) {
        await git.branchDelete(false, branch)
      }

      // Remove all refs/remotes/origin/* to avoid conflicts
      branches = await git.branchList(true)
      for (const branch of branches) {
        await git.branchDelete(true, branch)
      }

      // Clean
      if (clean) {
        if (!(await git.tryClean())) {
          core.debug(
            `The clean command failed. This might be caused by: 1) path too long, 2) permission issue, or 3) file in use. For futher investigation, manually run 'git clean -ffdx' on the directory '${repositoryPath}'.`
          )
          remove = true
        } else if (!(await git.tryReset())) {
          remove = true
        }

        if (remove) {
          core.warning(
            `Unable to clean or reset the repository. The repository will be recreated instead.`
          )
        }
      }
    } catch (error) {
      core.warning(
        `Unable to prepare the existing repository. The repository will be recreated instead.`
      )
      remove = true
    }
  }

  if (remove) {
    // Delete the contents of the directory. Don't delete the directory itself
    // since it might be the current working directory.
    core.info(`Deleting the contents of '${repositoryPath}'`)
    for (const file of await fs.promises.readdir(repositoryPath)) {
      await io.rmRF(path.join(repositoryPath, file))
    }
  }
}

async function configureAuthToken(
  git: IGitCommandManager,
  authToken: string
): Promise<void> {
  // Add extraheader (auth)
  const base64Credentials = Buffer.from(
    `x-access-token:${authToken}`,
    'utf8'
  ).toString('base64')
  core.setSecret(base64Credentials)
  const authConfigValue = `AUTHORIZATION: basic ${base64Credentials}`
  await git.config(authConfigKey, authConfigValue)
}

async function removeGitConfig(
  git: IGitCommandManager,
  configKey: string
): Promise<void> {
  if (
    (await git.configExists(configKey)) &&
    !(await git.tryConfigUnset(configKey))
  ) {
    // Load the config contents
    core.warning(`Failed to remove '${configKey}' from the git config`)
  }
}
