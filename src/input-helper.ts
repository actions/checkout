import * as core from '@actions/core'
import * as fsHelper from './fs-helper'
import * as github from '@actions/github'
import * as path from 'path'
import * as unsafePrCheckoutHelper from './unsafe-pr-checkout-helper'
import * as workflowContextHelper from './workflow-context-helper'
import {IGitSourceSettings} from './git-source-settings'

export async function getInputs(): Promise<IGitSourceSettings> {
  const result = ({} as unknown) as IGitSourceSettings

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
  // core.getInput()'s default trim strips a range of Unicode characters such as a
  // leading BOM (U+FEFF) or NBSP (U+00A0). Those are valid in a git ref name, so
  // a fork branch named "<BOM>" + 40 hex chars would trim down to a bare SHA and
  // be silently reclassified as a commit, bypassing the unsafe fork PR checkout
  // guard.
  //
  // The trim below strips only the ASCII whitespace characters which are all forbidden
  // in a git branch name.
  //   \t  U+0009  horizontal tab   - ASCII control, forbidden in ref names
  //   \n  U+000A  line feed        - ASCII control, forbidden in ref names
  //   \v  U+000B  vertical tab     - ASCII control, forbidden in ref names
  //   \f  U+000C  form feed        - ASCII control, forbidden in ref names
  //   \r  U+000D  carriage return  - ASCII control, forbidden in ref names
  //   ' ' U+0020  space            - forbidden in ref names
  const asciiTrimmedRef = core
    .getInput('ref', {trimWhitespace: false})
    .replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '')
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
  else if (asciiTrimmedRef.match(/^[0-9a-fA-F]{40}$/)) {
    result.commit = asciiTrimmedRef
    result.ref = ''
  }
  core.debug(`ref = '${result.ref}'`)
  core.debug(`commit = '${result.commit}'`)

  // Clean
  result.clean = (core.getInput('clean') || 'true').toUpperCase() === 'TRUE'
  core.debug(`clean = ${result.clean}`)

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

  // Persist credentials
  result.persistCredentials =
    (core.getInput('persist-credentials') || 'false').toUpperCase() === 'TRUE'

  // Workflow organization ID
  result.workflowOrganizationId = await workflowContextHelper.getOrganizationId()

  // Set safe.directory in git global config.
  result.setSafeDirectory =
    (core.getInput('set-safe-directory') || 'true').toUpperCase() === 'TRUE'

  // Determine the GitHub URL that the repository is being hosted from
  result.githubServerUrl = core.getInput('github-server-url')
  core.debug(`GitHub Host URL = ${result.githubServerUrl}`)

  // Allow unsafe PR checkout (opt-in for pull_request_target / workflow_run fork PRs)
  result.allowUnsafePrCheckout =
    (core.getInput('allow-unsafe-pr-checkout') || 'false').toUpperCase() ===
    'TRUE'
  core.debug(`allow unsafe PR checkout = ${result.allowUnsafePrCheckout}`)

  // The default self-checkout (this repository with no explicit ref) always
  // resolves to the trusted ref/commit GitHub set for the triggering event, so
  // the fork-checkout guard only needs to run when the caller customized the
  // repository or ref.
  const isDefaultCheckout = isWorkflowRepository && !core.getInput('ref')
  if (!isDefaultCheckout) {
    unsafePrCheckoutHelper.assertSafePrCheckout({
      qualifiedRepository,
      ref: result.ref,
      commit: result.commit,
      allowUnsafePrCheckout: result.allowUnsafePrCheckout
    })
  }

  return result
}
