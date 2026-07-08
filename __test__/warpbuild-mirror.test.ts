import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll
} from '@jest/globals'
import {
  SKIP_NOT_WARPBUILD,
  computeDestinationRef,
  getMirrorCacheSkipReason
} from '../src/warpbuild/mirror-cache.js'
import {lookupSnapshot, requestUploadURL} from '../src/warpbuild/backend-api.js'
import {IGitSourceSettings} from '../src/git-source-settings.js'

const WB_ENV = [
  'WARPBUILD_RUNNER_VERIFICATION_TOKEN',
  'WARPBUILD_HOST_URL',
  'GITHUB_REPOSITORY_ID',
  'GITHUB_REPOSITORY'
]
const savedEnv: {[key: string]: string | undefined} = {}
for (const key of WB_ENV) {
  savedEnv[key] = process.env[key]
}

const SHA = 'cd5255d20e23e050238affc045ba9beee35eaaf7'

function settingsFor(
  overrides: Partial<IGitSourceSettings> = {}
): IGitSourceSettings {
  return {
    repositoryOwner: 'octocat',
    repositoryName: 'hello-world',
    repositoryPath: '/tmp/does-not-matter',
    ref: 'refs/heads/main',
    commit: SHA,
    fetchDepth: 1,
    fetchTags: false,
    filter: undefined,
    sparseCheckout: undefined,
    lfs: false,
    ...overrides
  } as unknown as IGitSourceSettings
}

function setWarpBuildEnv(): void {
  process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN'] = 'test-token'
  process.env['WARPBUILD_HOST_URL'] = 'https://api.example.dev'
  process.env['GITHUB_REPOSITORY_ID'] = '123456789'
  process.env['GITHUB_REPOSITORY'] = 'octocat/hello-world'
}

describe('warpbuild snapshot cache', () => {
  beforeEach(() => {
    setWarpBuildEnv()
  })

  afterAll(() => {
    for (const key of WB_ENV) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
  })

  describe('getMirrorCacheSkipReason', () => {
    const winOnly = process.platform === 'win32' ? it.skip : it

    winOnly('returns null for the default checkout shape', () => {
      expect(getMirrorCacheSkipReason(settingsFor())).toBeNull()
    })

    it('reports a non-WarpBuild runner', () => {
      delete process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN']
      expect(getMirrorCacheSkipReason(settingsFor())).toBe(SKIP_NOT_WARPBUILD)
    })

    it('reports repository: inputs that are not the workflow repo', () => {
      expect(
        getMirrorCacheSkipReason(settingsFor({repositoryName: 'other-repo'}))
      ).toBe(
        "repository 'octocat/other-repo' is not the workflow repository 'octocat/hello-world'"
      )
    })

    it('requires an exact commit sha', () => {
      expect(getMirrorCacheSkipReason(settingsFor({commit: ''}))).toBe(
        'no exact commit sha to key on'
      )
      expect(getMirrorCacheSkipReason(settingsFor({commit: 'main'}))).toBe(
        'no exact commit sha to key on'
      )
    })

    it('only serves fetch-depth 1', () => {
      expect(getMirrorCacheSkipReason(settingsFor({fetchDepth: 0}))).toBe(
        'fetch-depth is 0, cache only serves fetch-depth 1'
      )
      expect(getMirrorCacheSkipReason(settingsFor({fetchDepth: 50}))).toBe(
        'fetch-depth is 50, cache only serves fetch-depth 1'
      )
    })

    it('skips fetch-tags, filters, sparse and lfs checkouts', () => {
      expect(getMirrorCacheSkipReason(settingsFor({fetchTags: true}))).toBe(
        'fetch-tags is enabled'
      )
      expect(getMirrorCacheSkipReason(settingsFor({filter: 'blob:none'}))).toBe(
        'a fetch filter is configured'
      )
      expect(
        getMirrorCacheSkipReason(settingsFor({sparseCheckout: ['src']}))
      ).toBe('sparse checkout is configured')
      expect(getMirrorCacheSkipReason(settingsFor({lfs: true}))).toBe(
        'lfs is enabled (lfs objects are not in the snapshot)'
      )
    })

    winOnly('accepts sha-only checkouts (empty ref)', () => {
      expect(getMirrorCacheSkipReason(settingsFor({ref: ''}))).toBeNull()
    })

    it('skips unqualified refs', () => {
      expect(getMirrorCacheSkipReason(settingsFor({ref: 'main'}))).toBe(
        "ref 'main' has no cacheable destination ref"
      )
    })
  })

  describe('computeDestinationRef', () => {
    it('maps the refs the fetch would have created', () => {
      expect(computeDestinationRef('refs/heads/main')).toBe(
        'refs/remotes/origin/main'
      )
      expect(computeDestinationRef('refs/pull/42/merge')).toBe(
        'refs/remotes/pull/42/merge'
      )
      expect(computeDestinationRef('refs/tags/v1.2.3')).toBe('refs/tags/v1.2.3')
      expect(computeDestinationRef('')).toBe('')
      expect(computeDestinationRef('main')).toBeNull()
    })
  })

  describe('backend api http contract', () => {
    const realFetch = globalThis.fetch
    let lastUrl = ''

    afterEach(() => {
      globalThis.fetch = realFetch
    })

    function stubFetch(status: number, body: unknown): void {
      globalThis.fetch = (async (input: unknown) => {
        lastUrl = String(input)
        return new Response(JSON.stringify(body), {status})
      }) as typeof fetch
    }

    it('maps 200 to hit and keys by sha', async () => {
      stubFetch(200, {url: 'https://s3/x', size_bytes: 42, created_at: 'now'})
      const result = await lookupSnapshot('123', SHA)
      expect(result.kind).toBe('hit')
      expect(lastUrl).toContain(`sha=${SHA}`)
    })

    it('maps 404 to miss (upload after the stock fetch)', async () => {
      stubFetch(404, {sub_code: 'NFE_GITMIRROR'})
      expect((await lookupSnapshot('123', SHA)).kind).toBe('miss')
    })

    it('maps 403 to disabled (backend kill switch)', async () => {
      stubFetch(403, {sub_code: 'PDE_GITMIRROR_DISABLED'})
      expect((await lookupSnapshot('123', SHA)).kind).toBe('disabled')
      expect((await requestUploadURL('123', SHA)).kind).toBe('disabled')
    })

    it('maps other statuses and network failures to error', async () => {
      stubFetch(500, {})
      expect((await lookupSnapshot('123', SHA)).kind).toBe('error')
      globalThis.fetch = (async () => {
        throw new Error('boom')
      }) as typeof fetch
      expect((await lookupSnapshot('123', SHA)).kind).toBe('error')
      expect((await requestUploadURL('123', SHA)).kind).toBe('error')
    })

    it('maps 200 upload responses to ok', async () => {
      stubFetch(200, {url: 'https://s3/put'})
      expect(await requestUploadURL('123', SHA)).toEqual({
        kind: 'ok',
        url: 'https://s3/put'
      })
    })
  })
})
