import * as github from '@actions/github'
import {fromPayload} from './ref-helper'

const PR_REF_PATTERN = /^refs\/pull\/[0-9]+\/(?:head|merge)$/

export interface IUnsafePrCheckoutInput {
  qualifiedRepository: string
  ref: string
  commit: string | undefined
  allowUnsafePrCheckout: boolean
}

export function assertSafePrCheckout(input: IUnsafePrCheckoutInput): void {
  if (input.allowUnsafePrCheckout) {
    return
  }

  const eventName = github.context.eventName
  if (eventName !== 'pull_request_target' && eventName !== 'workflow_run') {
    return
  }

  const baseRepoId = fromPayload('repository.id')
  if (typeof baseRepoId !== 'number') {
    return
  }

  let prHeadRepoId: unknown
  let prHeadRepoFullName: unknown
  const prShas: string[] = []

  if (eventName === 'pull_request_target') {
    prHeadRepoId = fromPayload('pull_request.head.repo.id')
    prHeadRepoFullName = fromPayload('pull_request.head.repo.full_name')
    pushIfSha(prShas, fromPayload('pull_request.head.sha'))
    pushIfSha(prShas, fromPayload('pull_request.merge_commit_sha'))
  } else {
    const wrEvent = fromPayload('workflow_run.event')
    if (typeof wrEvent !== 'string' || !wrEvent.startsWith('pull_request')) {
      return
    }
    prHeadRepoId = fromPayload('workflow_run.head_repository.id')
    prHeadRepoFullName = fromPayload('workflow_run.head_repository.full_name')
    pushIfSha(prShas, fromPayload('workflow_run.head_commit.id'))
    // For `pull_request_target`-triggered workflow_run, `head_sha` is the base
    // default branch SHA (not the PR head)
    if (wrEvent !== 'pull_request_target') {
      pushIfSha(prShas, fromPayload('workflow_run.head_sha'))
    }
  }

  // (A) Fork PR?
  if (typeof prHeadRepoId !== 'number' || prHeadRepoId === baseRepoId) {
    return
  }

  // (B) We cannot check for all fork PR refs so check to see
  // if the resolved input points to the fork PR sha we have in the payload
  const repositoryMatchesPrHead =
    typeof prHeadRepoFullName === 'string' &&
    input.qualifiedRepository.toLowerCase() === prHeadRepoFullName.toLowerCase()
  const refMatchesPullPattern = PR_REF_PATTERN.test(input.ref)
  const commitMatchesPrHeadSha =
    !!input.commit && prShas.includes(input.commit.toLowerCase())

  if (
    !repositoryMatchesPrHead &&
    !refMatchesPullPattern &&
    !commitMatchesPrHeadSha
  ) {
    return
  }

  throw new Error(
    `Refusing to check out fork pull request code from a '${eventName}' workflow. ` +
      `This workflow runs with the base repository's GITHUB_TOKEN, secrets, default-branch ` +
      `cache scope, and runner access. Fetching and executing a fork's code in that trusted ` +
      `context commonly leads to "pwn request" vulnerabilities. To opt in, review the risks ` +
      `at https://gh.io/securely-using-pull_request_target and set 'allow-unsafe-pr-checkout: true' ` +
      `on the actions/checkout step.`
  )
}

function pushIfSha(target: string[], value: unknown): void {
  if (typeof value === 'string' && value.length > 0) {
    target.push(value.toLowerCase())
  }
}
