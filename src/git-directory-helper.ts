import * as assert from 'assert'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as fsHelper from './fs-helper'
import * as io from '@actions/io'
import * as path from 'path'
import {IGitCommandManager} from './git-command-manager'

export async function prepareExistingDirectory(
  git: IGitCommandManager | undefined,
  repositoryPath: string,
  repositoryUrl: string,
  clean: boolean,
  ref: string
): Promise<void> {
  assert.ok(repositoryPath, 'Expected repositoryPath to be defined')
  assert.ok(repositoryUrl, 'Expected repositoryUrl to be defined')

  // Indicates whether to delete the directory contents
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
        core.debug(
          `Unable to delete '${lockPath}'. ${(error as any)?.message ?? error}`
        )
      }
    }

    try {
      core.startGroup('Removing previously created refs, to avoid conflicts')
      // Checkout detached HEAD
      if (!(await git.isDetached())) {
        await git.checkoutDetach()
      }

      // Remove all refs/heads/*
      let branches = await git.branchList(false)
      for (const branch of branches) {
        await git.branchDelete(false, branch)
      }

      // Remove any conflicting refs/remotes/origin/*
      // Example 1: Consider ref is refs/heads/foo and previously fetched refs/remotes/origin/foo/bar
      // Example 2: Consider ref is refs/heads/foo/bar and previously fetched refs/remotes/origin/foo
      if (ref) {
        ref = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`
        if (ref.startsWith('refs/heads/')) {
          const upperName1 = ref.toUpperCase().substr('REFS/HEADS/'.length)
          const upperName1Slash = `${upperName1}/`
          branches = await git.branchList(true)
          for (const branch of branches) {
            const upperName2 = branch.substr('origin/'.length).toUpperCase()
            const upperName2Slash = `${upperName2}/`
            if (
              upperName1.startsWith(upperName2Slash) ||
              upperName2.startsWith(upperName1Slash)
            ) {
              await git.branchDelete(true, branch)
            }
          }
        }
      }
      core.endGroup()

      // Clean
      if (clean) {
        core.startGroup('Cleaning the repository')
        if (!(await git.tryClean())) {
          core.debug(
            `The clean command failed. This might be caused by: 1) path too long, 2) permission issue, or 3) file in use. For futher investigation, manually run 'git clean -ffdx' on the directory '${repositoryPath}'.`
          )
          remove = true
        } else if (!(await git.tryReset())) {
          remove = true
        }
        core.endGroup()

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
