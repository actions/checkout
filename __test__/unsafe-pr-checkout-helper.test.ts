import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll
} from '@jest/globals'

const BASE_REPO_ID = 100
const FORK_REPO_ID = 200
const PR_HEAD_SHA = '1111111111111111111111111111111111111111'
const PR_MERGE_SHA = '2222222222222222222222222222222222222222'
const SAFE_BASE_SHA = '3333333333333333333333333333333333333333'
const WORKFLOW_RUN_HEAD_COMMIT_SHA = '4444444444444444444444444444444444444444'
const BASE_QUALIFIED_REPO = 'some-owner/some-repo'
const FORK_QUALIFIED_REPO = 'another-repo/fork'

// Mutable mock context
const mockContext: any = {
  eventName: '',
  payload: {},
  repo: {owner: 'some-owner', repo: 'some-repo'},
  ref: '',
  sha: ''
}

jest.unstable_mockModule('@actions/github', () => ({
  context: mockContext
}))

// Dynamic imports after mocking
const {assertSafePrCheckout} = await import(
  '../src/unsafe-pr-checkout-helper.js'
)

const originalEventName = mockContext.eventName
const originalPayload = mockContext.payload

function setContext(eventName: string, payload: object): void {
  mockContext.eventName = eventName
  mockContext.payload = payload
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
    mockContext.repo = {owner: 'some-owner', repo: 'some-repo'}
  })

  afterEach(() => {
    mockContext.eventName = originalEventName
    mockContext.payload = originalPayload
  })

  afterAll(() => {
    mockContext.eventName = originalEventName
    mockContext.payload = originalPayload
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
