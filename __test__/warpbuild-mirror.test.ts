import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll
} from '@jest/globals'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  SKIP_NOT_WARPBUILD,
  computeRefKey,
  getMirrorCacheSkipReason,
  resetGitObjects
} from '../src/warpbuild/mirror-cache.js'
import {
  lookupRestore,
  requestBaseUpload,
  requestBranchUpload
} from '../src/warpbuild/backend-api.js'
import {IGitSourceSettings} from '../src/git-source-settings.js'

const WB_ENV = [
  'WARPBUILD_RUNNER_VERIFICATION_TOKEN',
  'WARPBUILD_HOST_URL',
  'GITHUB_REPOSITORY_ID',
  'GITHUB_REPOSITORY',
  'GITHUB_REF',
  'GITHUB_BASE_REF'
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
  delete process.env['GITHUB_REF']
  delete process.env['GITHUB_BASE_REF']
}

describe('warpbuild mirror cache', () => {
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
    it('returns null for the default checkout shape', () => {
      expect(getMirrorCacheSkipReason(settingsFor())).toBeNull()
    })

    it('reports a non-WarpBuild runner', () => {
      delete process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN']
      expect(getMirrorCacheSkipReason(settingsFor())).toBe(SKIP_NOT_WARPBUILD)
    })

    it('reports repository inputs that are not the workflow repo', () => {
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

    it('serves any fetch-depth and fetch-tags (mirror is full history)', () => {
      expect(getMirrorCacheSkipReason(settingsFor({fetchDepth: 0}))).toBeNull()
      expect(getMirrorCacheSkipReason(settingsFor({fetchDepth: 50}))).toBeNull()
      expect(
        getMirrorCacheSkipReason(settingsFor({fetchTags: true}))
      ).toBeNull()
    })

    it('skips filters, sparse and lfs checkouts', () => {
      expect(getMirrorCacheSkipReason(settingsFor({filter: 'blob:none'}))).toBe(
        'a fetch filter is configured'
      )
      expect(
        getMirrorCacheSkipReason(settingsFor({sparseCheckout: ['src']}))
      ).toBe('sparse checkout is configured')
      expect(getMirrorCacheSkipReason(settingsFor({lfs: true}))).toBe(
        'lfs is enabled (lfs objects are not in the mirror)'
      )
    })
  })

  describe('computeRefKey', () => {
    it('keys on the pushed branch (GITHUB_REF)', () => {
      process.env['GITHUB_REF'] = 'refs/heads/feature/x'
      expect(computeRefKey(settingsFor())).toBe('feature/x')
    })

    it('keys on the base branch for pull requests (merge sha is synthetic)', () => {
      process.env['GITHUB_REF'] = 'refs/pull/42/merge'
      process.env['GITHUB_BASE_REF'] = 'main'
      expect(computeRefKey(settingsFor())).toBe('main')
    })

    it('is empty for tags and bare pull refs (base only, no roll)', () => {
      process.env['GITHUB_REF'] = 'refs/tags/v1.2.3'
      expect(computeRefKey(settingsFor())).toBe('')
      process.env['GITHUB_REF'] = 'refs/pull/42/merge'
      expect(computeRefKey(settingsFor())).toBe('')
    })

    it('is empty for a detached sha checkout', () => {
      expect(computeRefKey(settingsFor({ref: SHA}))).toBe('')
    })

    it('passes through an already-short branch name', () => {
      expect(computeRefKey(settingsFor({ref: 'main'}))).toBe('main')
    })
  })

  describe('resetGitObjects', () => {
    it('restores the empty git-init object layout, dropping restored junk', async () => {
      const gitDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'wb-reset-')
      )
      try {
        await fs.promises.mkdir(path.join(gitDir, 'objects', 'pack'), {
          recursive: true
        })
        await fs.promises.writeFile(
          path.join(gitDir, 'objects', 'ab'),
          'junk loose object'
        )
        await fs.promises.writeFile(path.join(gitDir, 'shallow'), 'deadbeef\n')

        await resetGitObjects(gitDir)

        expect(fs.existsSync(path.join(gitDir, 'shallow'))).toBe(false)
        expect(fs.existsSync(path.join(gitDir, 'objects', 'ab'))).toBe(false)
        expect(
          (await fs.promises.readdir(path.join(gitDir, 'objects'))).sort()
        ).toEqual(['info', 'pack'])
      } finally {
        await fs.promises.rm(gitDir, {recursive: true, force: true})
      }
    })
  })

  describe('backend api http contract', () => {
    const realFetch = globalThis.fetch
    let lastUrl = ''
    let lastInit: RequestInit | undefined

    afterEach(() => {
      globalThis.fetch = realFetch
    })

    function stubFetch(status: number, body: unknown): void {
      globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        lastUrl = String(input)
        lastInit = init
        return new Response(JSON.stringify(body), {status})
      }) as typeof fetch
    }

    it('lookupRestore maps 200 to a restore plan keyed by ref', async () => {
      stubFetch(200, {
        base: {url: 'https://s3/base', size_bytes: 42},
        branch: {url: 'https://s3/branch'}
      })
      const result = await lookupRestore('123', 'main')
      expect(result.kind).toBe('restore')
      if (result.kind === 'restore') {
        expect(result.base.url).toBe('https://s3/base')
        expect(result.branch?.url).toBe('https://s3/branch')
      }
      expect(lastUrl).toContain('ref=main')
    })

    it('lookupRestore maps a null branch (base but no delta yet)', async () => {
      stubFetch(200, {base: {url: 'https://s3/base'}, branch: null})
      const result = await lookupRestore('123', 'main')
      expect(result.kind).toBe('restore')
      if (result.kind === 'restore') {
        expect(result.branch).toBeNull()
      }
    })

    it('lookupRestore maps 404 to cold, 403 to disabled, 500 to error', async () => {
      stubFetch(404, {sub_code: 'NFE_GITMIRROR'})
      expect((await lookupRestore('123', 'main')).kind).toBe('cold')
      stubFetch(403, {sub_code: 'PDE_GITMIRROR_DISABLED'})
      expect((await lookupRestore('123', 'main')).kind).toBe('disabled')
      stubFetch(500, {})
      expect((await lookupRestore('123', 'main')).kind).toBe('error')
    })

    it('lookupRestore maps network failure to error', async () => {
      globalThis.fetch = (async () => {
        throw new Error('boom')
      }) as typeof fetch
      expect((await lookupRestore('123', 'main')).kind).toBe('error')
    })

    it('requestBaseUpload maps 200 to a grant, 409 to locked', async () => {
      stubFetch(200, {url: 'https://s3/put-base'})
      const grant = await requestBaseUpload('123')
      expect(grant.kind).toBe('grant')
      if (grant.kind === 'grant') {
        expect(grant.url).toBe('https://s3/put-base')
      }
      expect(lastInit?.method).toBe('POST')
      stubFetch(409, {sub_code: 'FVE_GITMIRROR_LOCKED'})
      expect((await requestBaseUpload('123')).kind).toBe('locked')
    })

    it('requestBranchUpload maps 200 to a grant, 403 to disabled', async () => {
      stubFetch(200, {url: 'https://s3/put-branch'})
      expect((await requestBranchUpload('123', 'main', SHA)).kind).toBe('grant')
      stubFetch(403, {})
      expect((await requestBranchUpload('123', 'main', SHA)).kind).toBe(
        'disabled'
      )
    })
  })
})
