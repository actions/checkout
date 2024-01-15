import {IGitCommandManager} from './git-command-manager'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {getServerApiUrl, isGhes} from './url-helper'

export const tagsRefSpec = '+refs/tags/*:refs/tags/*'

export interface ICheckoutInfo {
  ref: string
  startPoint: string
}

export async function getCheckoutInfo(
  git: IGitCommandManager,
  ref: string,
  commit: string
): Promise<ICheckoutInfo> {
  if (!git) {
    throw new Error('Arg git cannot be empty')
  }

  if (!ref && !commit) {
    throw new Error('Args ref and commit cannot both be empty')
  }

  const result = ({} as unknown) as ICheckoutInfo
  const upperRef = (ref || '').toUpperCase()

  // SHA only
  if (!ref) {
    result.ref = commit
  }
  // refs/heads/
  else if (upperRef.startsWith('REFS/HEADS/')) {
    const branch = ref.substring('refs/heads/'.length)
    result.ref = branch
    result.startPoint = `refs/remotes/origin/${branch}`
  }
  // refs/pull/
  else if (upperRef.startsWith('REFS/PULL/')) {
    const branch = ref.substring('refs/pull/'.length)
    result.ref = `refs/remotes/pull/${branch}`
  }
  // refs/tags/
  else if (upperRef.startsWith('REFS/')) {
    result.ref = ref
  }
  // Unqualified ref, check for a matching branch or tag
  else {
    if (await git.branchExists(true, `origin/${ref}`)) {
      result.ref = ref
      result.startPoint = `refs/remotes/origin/${ref}`
    } else if (await git.tagExists(`${ref}`)) {
      result.ref = `refs/tags/${ref}`
    } else {
      throw new Error(
        `A branch or tag with the name '${ref}' could not be found`
      )
    }
  }

  return result
}

export function getRefSpecForAllHistory(ref: string, commit: string): string[] {
  const result = ['+refs/heads/*:refs/remotes/origin/*', tagsRefSpec]
  if (ref && ref.toUpperCase().startsWith('REFS/PULL/')) {
    const branch = ref.substring('refs/pull/'.length)
    result.push(`+${commit || ref}:refs/remotes/pull/${branch}`)
  }

  return result
}

export function getRefSpec(ref: string, commit: string): string[] {
  if (!ref && !commit) {
    throw new Error('Args ref and commit cannot both be empty')
  }

  const upperRef = (ref || '').toUpperCase()

  // SHA
  if (commit) {
    // refs/heads
    if (upperRef.startsWith('REFS/HEADS/')) {
      const branch = ref.substring('refs/heads/'.length)
      return [`+${commit}:refs/remotes/origin/${branch}`]
    }
    // refs/pull/
    else if (upperRef.startsWith('REFS/PULL/')) {
      const branch = ref.substring('refs/pull/'.length)
      return [`+${commit}:refs/remotes/pull/${branch}`]
    }
    // refs/tags/
    else if (upperRef.startsWith('REFS/TAGS/')) {
      return [`+${commit}:${ref}`]
    }
    // Otherwise no destination ref
    else {
      return [commit]
    }
  }
  // Unqualified ref, check for a matching branch or tag
  else if (!upperRef.startsWith('REFS/')) {
    return [
      `+refs/heads/${ref}*:refs/remotes/origin/${ref}*`,
      `+refs/tags/${ref}*:refs/tags/${ref}*`
    ]
  }
  // refs/heads/
  else if (upperRef.startsWith('REFS/HEADS/')) {
    const branch = ref.substring('refs/heads/'.length)
    return [`+${ref}:refs/remotes/origin/${branch}`]
  }
  // refs/pull/
  else if (upperRef.startsWith('REFS/PULL/')) {
    const branch = ref.substring('refs/pull/'.length)
    return [`+${ref}:refs/remotes/pull/${branch}`]
  }
  // refs/tags/
  else {
    return [`+${ref}:${ref}`]
  }
}

/**
 * Tests whether the initial fetch created the ref at the expected commit
 */
export async function testRef(
  git: IGitCommandManager,
  ref: string,
  commit: string
): Promise<boolean> {
  if (!git) {
    throw new Error('Arg git cannot be empty')
  }

  if (!ref && !commit) {
    throw new Error('Args ref and commit cannot both be empty')
  }

  // No SHA? Nothing to test
  if (!commit) {
    return true
  }
  // SHA only?
  else if (!ref) {
    return await git.shaExists(commit)
  }

  const upperRef = ref.toUpperCase()

  // refs/heads/
  if (upperRef.startsWith('REFS/HEADS/')) {
    const branch = ref.substring('refs/heads/'.length)
    return (
      (await git.branchExists(true, `origin/${branch}`)) &&
      commit === (await git.revParse(`refs/remotes/origin/${branch}`))
    )
  }
  // refs/pull/
  else if (upperRef.startsWith('REFS/PULL/')) {
    // Assume matches because fetched using the commit
    return true
  }
  // refs/tags/
  else if (upperRef.startsWith('REFS/TAGS/')) {
    const tagName = ref.substring('refs/tags/'.length)
    return (
      (await git.tagExists(tagName)) && commit === (await git.revParse(ref))
    )
  }
  // Unexpected
  else {
    core.debug(`Unexpected ref format '${ref}' when testing ref info`)
    return true
  }
}

export async function checkCommitInfo(
  token: string,
  commitInfo: string,
  repositoryOwner: string,
  repositoryName: string,
  ref: string,
  commit: string,
  baseUrl?: string
): Promise<void> {
  try {
    // GHES?
    if (isGhes(baseUrl)) {
      return
    }

    // Auth token?
    if (!token) {
      return
    }

    // Public PR synchronize, for workflow repo?
    if (
      fromPayload('repository.private') !== false ||
      github.context.eventName !== 'pull_request' ||
      fromPayload('action') !== 'synchronize' ||
      repositoryOwner !== github.context.repo.owner ||
      repositoryName !== github.context.repo.repo ||
      ref !== github.context.ref ||
      !ref.startsWith('refs/pull/') ||
      commit !== github.context.sha
    ) {
      return
    }

    // Head SHA
    const expectedHeadSha = fromPayload('after')
    if (!expectedHeadSha) {
      core.debug('Unable to determine head sha')
      return
    }

    // Base SHA
    const expectedBaseSha = fromPayload('pull_request.base.sha')
    if (!expectedBaseSha) {
      core.debug('Unable to determine base sha')
      return
    }

    // Expected message?
    const expectedMessage = `Merge ${expectedHeadSha} into ${expectedBaseSha}`
    if (commitInfo.indexOf(expectedMessage) >= 0) {
      return
    }

    // Extract details from message
    const match = commitInfo.match(/Merge ([0-9a-f]{40}) into ([0-9a-f]{40})/)
    if (!match) {
      core.debug('Unexpected message format')
      return
    }

    // Post telemetry
    const actualHeadSha = match[1]
    if (actualHeadSha !== expectedHeadSha) {
      core.debug(
        `Expected head sha ${expectedHeadSha}; actual head sha ${actualHeadSha}`
      )
      const octokit = github.getOctokit(token, {
        baseUrl: getServerApiUrl(baseUrl),
        userAgent: `actions-checkout-tracepoint/1.0 (code=STALE_MERGE;owner=${repositoryOwner};repo=${repositoryName};pr=${fromPayload(
          'number'
        )};run_id=${
          process.env['GITHUB_RUN_ID']
        };expected_head_sha=${expectedHeadSha};actual_head_sha=${actualHeadSha})`
      })
      await octokit.rest.repos.get({
        owner: repositoryOwner,
        repo: repositoryName
      })
    }
  } catch (err) {
    core.debug(
      `Error when validating commit info: ${(err as any)?.stack ?? err}`
    )
  }
}

function fromPayload(path: string): any {
  return select(github.context.payload, path)
}

function select(obj: any, path: string): any {
  if (!obj) {
    return undefined
  }

  const i = path.indexOf('.')
  if (i < 0) {
    return obj[path]
  }

  const key = path.substr(0, i)
  return select(obj[key], path.substr(i + 1))
}
