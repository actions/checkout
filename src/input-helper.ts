import * as core from '@actions/core'
import * as fsHelper from './fs-helper'
import * as github from '@actions/github'
import * as path from 'path'
import * as workflowContextHelper from './workflow-context-helper'
import {IGitSourceSettings} from './git-source-settings'

export async function getInputs(): Promise<IGitSourceSettings> {
  const result = {} as unknown as IGitSourceSettings

  // GitHub workspace
  let githubWorkspacePath = process.env['GITHUB_WORKSPACE']
  if (!githubWorkspacePath) {
    throw new Error('GITHUB_WORKSPACE not defined')
  }
  githubWorkspacePath = path.resolve(githubWorkspacePath)
  core.debug(`GITHUB_WORKSPACE = '${githubWorkspacePath}'`)
  fsHelper.directoryExistsSync(githubWorkspacePath, true)

  // Qualified repository
  const qualifiedRepository =
    core.getInput('repository') ||
    `${github.context.repo.owner}/${github.context.repo.repo}`
  core.debug(`qualified repository = '${qualifiedRepository}'`)
  const splitRepository = qualifiedRepository.split('/')
  if (
    splitRepository.length !== 2 ||
    !splitRepository[0] ||
    !splitRepository[1]
  ) {
    throw new Error(
      `Invalid repository '${qualifiedRepository}'. Expected format {owner}/{repo}.`
    )
  }
  result.repositoryOwner = splitRepository[0]
  result.repositoryName = splitRepository[1]

  // Repository path
  result.repositoryPath = core.getInput('path') || '.'
  result.repositoryPath = path.resolve(
    githubWorkspacePath,
    result.repositoryPath
  )
  if (
    !(result.repositoryPath + path.sep).startsWith(
      githubWorkspacePath + path.sep
    )
  ) {
    throw new Error(
      `Repository path '${result.repositoryPath}' is not under '${githubWorkspacePath}'`
    )
  }

  // Workflow repository?
  const isWorkflowRepository =
    qualifiedRepository.toUpperCase() ===
    `${github.context.repo.owner}/${github.context.repo.repo}`.toUpperCase()

  // Source branch, source version
  result.ref = core.getInput('ref')
  if (!result.ref) {
    if (isWorkflowRepository) {
      result.ref = github.context.ref
      result.commit = github.context.sha

      // Some events have an unqualifed ref. For example when a PR is merged (pull_request closed event),
      // the ref is unqualifed like "main" instead of "refs/heads/main".
      if (result.commit && result.ref && !result.ref.startsWith('refs/')) {
        result.ref = `refs/heads/${result.ref}`
      }
    }
  }
  // SHA?
  else if (result.ref.match(/^[0-9a-fA-F]{40}$/)) {
    result.commit = result.ref
    result.ref = ''
  }
  core.debug(`ref = '${result.ref}'`)
  core.debug(`commit = '${result.commit}'`)

  // Clean
  result.clean = (core.getInput('clean') || 'true').toUpperCase() === 'TRUE'
  core.debug(`clean = ${result.clean}`)

  // Filter
  const filter = core.getInput('filter')
  if (filter) {
    result.filter = filter
  }

  core.debug(`filter = ${result.filter}`)

  // Sparse checkout
  const sparseCheckout = core.getMultilineInput('sparse-checkout')
  if (sparseCheckout.length) {
    result.sparseCheckout = sparseCheckout
    core.debug(`sparse checkout = ${result.sparseCheckout}`)
  }

  result.sparseCheckoutConeMode =
    (core.getInput('sparse-checkout-cone-mode') || 'true').toUpperCase() ===
    'TRUE'

  // Fetch depth
  result.fetchDepth = Math.floor(Number(core.getInput('fetch-depth') || '1'))
  if (isNaN(result.fetchDepth) || result.fetchDepth < 0) {
    result.fetchDepth = 0
  }
  core.debug(`fetch depth = ${result.fetchDepth}`)

  // Fetch tags
  result.fetchTags =
    (core.getInput('fetch-tags') || 'false').toUpperCase() === 'TRUE'
  core.debug(`fetch tags = ${result.fetchTags}`)

  // Show fetch progress
  result.showProgress =
    (core.getInput('show-progress') || 'true').toUpperCase() === 'TRUE'
  core.debug(`show progress = ${result.showProgress}`)

  // LFS
  result.lfs = (core.getInput('lfs') || 'false').toUpperCase() === 'TRUE'
  core.debug(`lfs = ${result.lfs}`)

  // Submodules
  result.submodules = false
  result.nestedSubmodules = false
  const submodulesString = (core.getInput('submodules') || '').toUpperCase()
  if (submodulesString == 'RECURSIVE') {
    result.submodules = true
    result.nestedSubmodules = true
  } else if (submodulesString == 'TRUE') {
    result.submodules = true
  }
  core.debug(`submodules = ${result.submodules}`)
  core.debug(`recursive submodules = ${result.nestedSubmodules}`)

  // Auth token
  result.authToken = core.getInput('token', {required: true})

  // SSH
  result.sshKey = core.getInput('ssh-key')
  result.sshKnownHosts = core.getInput('ssh-known-hosts')
  result.sshStrict =
    (core.getInput('ssh-strict') || 'true').toUpperCase() === 'TRUE'
  result.sshUser = core.getInput('ssh-user')

  // Persist credentials
  result.persistCredentials =
    (core.getInput('persist-credentials') || 'false').toUpperCase() === 'TRUE'

  // Workflow organization ID
  result.workflowOrganizationId =
    await workflowContextHelper.getOrganizationId()

  // Set safe.directory in git global config.
  result.setSafeDirectory =
    (core.getInput('set-safe-directory') || 'true').toUpperCase() === 'TRUE'

  // Determine the GitHub URL that the repository is being hosted from
  result.githubServerUrl = core.getInput('github-server-url')
  core.debug(`GitHub Host URL = ${result.githubServerUrl}`)

  return result
}
