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
  ALTERNATES_CONTENT,
  SKIP_NOT_WARPBUILD,
  mirrorPath,
  getMirrorCacheSkipReason,
  writeAlternates
} from '../src/warpbuild/mirror-cache.js'
import {lookupMirror, requestUploadURL} from '../src/warpbuild/backend-api.js'
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

function settingsFor(
  owner: string,
  repo: string,
  serverUrl?: string
): IGitSourceSettings {
  return {
    repositoryOwner: owner,
    repositoryName: repo,
    repositoryPath: '/tmp/does-not-matter',
    githubServerUrl: serverUrl
  } as unknown as IGitSourceSettings
}

function setWarpBuildEnv(): void {
  process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN'] = 'test-token'
  process.env['WARPBUILD_HOST_URL'] = 'https://api.example.dev'
  process.env['GITHUB_REPOSITORY_ID'] = '123456789'
  process.env['GITHUB_REPOSITORY'] = 'octocat/hello-world'
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
    const winOnly = process.platform === 'win32' ? it.skip : it

    winOnly('returns null for the workflow repo on a WarpBuild runner', () => {
      expect(
        getMirrorCacheSkipReason(settingsFor('octocat', 'hello-world'))
      ).toBeNull()
    })

    it('reports a non-WarpBuild runner', () => {
      delete process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN']
      expect(
        getMirrorCacheSkipReason(settingsFor('octocat', 'hello-world'))
      ).toBe(SKIP_NOT_WARPBUILD)
    })

    it('reports repository: inputs that are not the workflow repo', () => {
      expect(
        getMirrorCacheSkipReason(settingsFor('octocat', 'other-repo'))
      ).toBe(
        "repository 'octocat/other-repo' is not the workflow repository 'octocat/hello-world'"
      )
    })

    it('reports a missing GITHUB_REPOSITORY_ID', () => {
      delete process.env['GITHUB_REPOSITORY_ID']
      expect(
        getMirrorCacheSkipReason(settingsFor('octocat', 'hello-world'))
      ).toBe('GITHUB_REPOSITORY_ID is not set')
    })

    winOnly('accepts explicit github.com server urls', () => {
      expect(
        getMirrorCacheSkipReason(
          settingsFor('octocat', 'hello-world', 'https://github.com')
        )
      ).toBeNull()
    })

    it('reports GHES server urls', () => {
      expect(
        getMirrorCacheSkipReason(
          settingsFor('octocat', 'hello-world', 'https://ghes.example.com')
        )
      ).toBe("server 'https://ghes.example.com' is not github.com")
    })
  })

  describe('backend api http contract', () => {
    const realFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = realFetch
    })

    function stubFetch(status: number, body: unknown): void {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(body), {status})) as typeof fetch
    }

    it('maps 200 to hit', async () => {
      stubFetch(200, {url: 'https://s3/x', size_bytes: 42, created_at: 'now'})
      const result = await lookupMirror('123')
      expect(result.kind).toBe('hit')
      if (result.kind === 'hit') {
        expect(result.info.url).toBe('https://s3/x')
      }
    })

    it('maps 404 to miss (hydrate)', async () => {
      stubFetch(404, {sub_code: 'NFE_GITMIRROR'})
      expect((await lookupMirror('123')).kind).toBe('miss')
    })

    it('maps 403 to disabled (backend kill switch — no hydration, no upload)', async () => {
      stubFetch(403, {sub_code: 'PDE_GITMIRROR_DISABLED'})
      expect((await lookupMirror('123')).kind).toBe('disabled')
      expect((await requestUploadURL('123')).kind).toBe('disabled')
    })

    it('maps other statuses to error (fall back without hydrating)', async () => {
      stubFetch(500, {})
      expect((await lookupMirror('123')).kind).toBe('error')
      expect((await requestUploadURL('123')).kind).toBe('error')
    })

    it('maps network failures to error', async () => {
      globalThis.fetch = (async () => {
        throw new Error('boom')
      }) as typeof fetch
      expect((await lookupMirror('123')).kind).toBe('error')
      expect((await requestUploadURL('123')).kind).toBe('error')
    })

    it('maps 200 upload responses to ok', async () => {
      stubFetch(200, {url: 'https://s3/put'})
      const result = await requestUploadURL('123')
      expect(result).toEqual({kind: 'ok', url: 'https://s3/put'})
    })
  })

  describe('mirror layout', () => {
    it('keeps the mirror inside .git', () => {
      expect(mirrorPath('/work/repo')).toBe(
        path.join('/work/repo', '.git', 'wb-mirror.git')
      )
    })

    it('uses a relative alternates path that never leaves .git', () => {
      expect(ALTERNATES_CONTENT).toBe('../wb-mirror.git/objects\n')
      expect(path.isAbsolute(ALTERNATES_CONTENT.trim())).toBe(false)
    })

    it('writeAlternates writes the relative path into objects/info', async () => {
      const workspace = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'wb-mirror-test-')
      )
      try {
        await writeAlternates(workspace)
        const content = await fs.promises.readFile(
          path.join(workspace, '.git', 'objects', 'info', 'alternates'),
          'utf8'
        )
        expect(content).toBe(ALTERNATES_CONTENT)
      } finally {
        await fs.promises.rm(workspace, {recursive: true, force: true})
      }
    })
  })
})
