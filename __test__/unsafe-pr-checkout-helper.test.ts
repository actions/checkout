import * as github from '@actions/github'
import {assertSafePrCheckout} from '../lib/unsafe-pr-checkout-helper'

// Shallow clone original @actions/github context
const originalContext = {...github.context}
const originalEventName = github.context.eventName
const originalPayload = github.context.payload

const BASE_REPO_ID = 100
const FORK_REPO_ID = 200
const PR_HEAD_SHA = '1111111111111111111111111111111111111111'
const PR_MERGE_SHA = '2222222222222222222222222222222222222222'
const SAFE_BASE_SHA = '3333333333333333333333333333333333333333'
const WORKFLOW_RUN_HEAD_COMMIT_SHA = '4444444444444444444444444444444444444444'
const BASE_QUALIFIED_REPO = 'some-owner/some-repo'
const FORK_QUALIFIED_REPO = 'another-repo/fork'

function setContext(eventName: string, payload: object): void {
  ;(github.context as {eventName: string}).eventName = eventName
  ;(github.context as {payload: object}).payload = payload
}

function forkPullRequestTargetPayload(): object {
  return {
    repository: {id: BASE_REPO_ID},
    pull_request: {
      head: {
        sha: PR_HEAD_SHA,
        repo: {id: FORK_REPO_ID, full_name: FORK_QUALIFIED_REPO}
      },
      merge_commit_sha: PR_MERGE_SHA
    }
  }
}

function sameRepoPullRequestTargetPayload(): object {
  return {
    repository: {id: BASE_REPO_ID},
    pull_request: {
      head: {
        sha: PR_HEAD_SHA,
        repo: {id: BASE_REPO_ID, full_name: BASE_QUALIFIED_REPO}
      },
      merge_commit_sha: PR_MERGE_SHA
    }
  }
}

function forkWorkflowRunPayload(): object {
  return {
    repository: {id: BASE_REPO_ID},
    workflow_run: {
      event: 'pull_request',
      head_commit: {id: WORKFLOW_RUN_HEAD_COMMIT_SHA},
      head_repository: {id: FORK_REPO_ID, full_name: FORK_QUALIFIED_REPO}
    }
  }
}

describe('unsafe-pr-checkout-helper', () => {
  beforeAll(() => {
    jest.spyOn(github.context, 'repo', 'get').mockReturnValue({
      owner: 'some-owner',
      repo: 'some-repo'
    })
  })

  afterEach(() => {
    ;(github.context as {eventName: string}).eventName = originalEventName
    ;(github.context as {payload: object}).payload = originalPayload
  })

  afterAll(() => {
    ;(github.context as {eventName: string}).eventName =
      originalContext.eventName
    ;(github.context as {payload: object}).payload = originalContext.payload
    jest.restoreAllMocks()
  })

  it('allows pull_request events untouched', () => {
    setContext('pull_request', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: 'attacker/fork',
        ref: 'refs/pull/1/merge',
        commit: '',
        allowUnsafePrCheckout: false
      })
    ).not.toThrow()
  })

  it('allows pull_request_target default checkout (base branch)', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: 'refs/heads/main',
        commit: SAFE_BASE_SHA,
        allowUnsafePrCheckout: false
      })
    ).not.toThrow()
  })

  it('allows same-repo pull_request_target checkout of PR head', () => {
    setContext('pull_request_target', sameRepoPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: '',
        commit: PR_HEAD_SHA,
        allowUnsafePrCheckout: false
      })
    ).not.toThrow()
  })

  it('refuses pull_request_target fork PR head SHA checkout', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: '',
        commit: PR_HEAD_SHA,
        allowUnsafePrCheckout: false
      })
    ).toThrow(/Refusing to check out fork pull request code/)
  })

  it('refuses pull_request_target fork PR merge_commit_sha checkout', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: '',
        commit: PR_MERGE_SHA,
        allowUnsafePrCheckout: false
      })
    ).toThrow(/allow-unsafe-pr-checkout/)
  })

  it('refuses pull_request_target fork PR ref pattern (head)', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: 'refs/pull/42/head',
        commit: '',
        allowUnsafePrCheckout: false
      })
    ).toThrow()
  })

  it('refuses pull_request_target fork PR ref pattern (merge)', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: 'refs/pull/42/merge',
        commit: '',
        allowUnsafePrCheckout: false
      })
    ).toThrow()
  })

  it('refuses pull_request_target when repository points at the fork', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: FORK_QUALIFIED_REPO,
        ref: 'refs/heads/main',
        commit: '',
        allowUnsafePrCheckout: false
      })
    ).toThrow()
  })

  it('allows pull_request_target checkout of an unrelated third-party repo', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: 'some-other/unrelated',
        ref: 'refs/heads/main',
        commit: '',
        allowUnsafePrCheckout: false
      })
    ).not.toThrow()
  })

  it('refuses pull_request_target ignoring repository case differences', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: FORK_QUALIFIED_REPO.toUpperCase(),
        ref: '',
        commit: '',
        allowUnsafePrCheckout: false
      })
    ).toThrow()
  })

  it('refuses pull_request_target ignoring commit SHA case differences', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: '',
        commit: PR_HEAD_SHA.toUpperCase(),
        allowUnsafePrCheckout: false
      })
    ).toThrow()
  })

  it('allows pull_request_target fork PR checkout when opted in', () => {
    setContext('pull_request_target', forkPullRequestTargetPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: 'refs/pull/42/merge',
        commit: '',
        allowUnsafePrCheckout: true
      })
    ).not.toThrow()
  })

  it('refuses workflow_run fork PR head_commit.id checkout', () => {
    setContext('workflow_run', forkWorkflowRunPayload())
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: '',
        commit: WORKFLOW_RUN_HEAD_COMMIT_SHA,
        allowUnsafePrCheckout: false
      })
    ).toThrow()
  })

  it('refuses workflow_run with pull_request_target underlying event', () => {
    const payload = forkWorkflowRunPayload() as {
      workflow_run: {event: string}
    }
    payload.workflow_run.event = 'pull_request_target'
    setContext('workflow_run', payload)
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: '',
        commit: WORKFLOW_RUN_HEAD_COMMIT_SHA,
        allowUnsafePrCheckout: false
      })
    ).toThrow()
  })

  it('allows workflow_run same-repo PR (head_repository.id matches base)', () => {
    const payload = forkWorkflowRunPayload() as {
      workflow_run: {head_repository: {id: number}}
    }
    payload.workflow_run.head_repository.id = BASE_REPO_ID
    setContext('workflow_run', payload)
    expect(() =>
      assertSafePrCheckout({
        qualifiedRepository: BASE_QUALIFIED_REPO,
        ref: '',
        commit: WORKFLOW_RUN_HEAD_COMMIT_SHA,
        allowUnsafePrCheckout: false
      })
    ).not.toThrow()
  })
})
