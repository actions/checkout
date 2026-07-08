/* eslint-disable i18n-text/no-en, import/no-unresolved -- English log strings and
   .js-suffixed ESM imports both follow upstream's own conventions; the import plugin
   has no TS resolver configured in this repo. */
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {IGitSourceSettings} from '../git-source-settings.js'
import * as api from './backend-api.js'

// WarpBuild git-mirror cache.
//
// A tar of the repo's bare mirror lives in a WarpBuild-owned S3 bucket. At checkout we
// restore it to <workspace>/.git/wb-mirror.git and point .git/objects/info/alternates at
// it, so the (unmodified) upstream fetch advertises the mirror's ref tips as "haves" and
// GitHub only sends objects the mirror doesn't already hold. On a miss (backend answers
// 404), THIS run creates the mirror: one full download of all branches + tags from
// GitHub, then tar + presigned PUT. When the backend answers 403 the feature is
// disabled for this org (backend-driven kill switch) and we skip everything — no
// mirror creation, no upload.
//
// The mirror lives INSIDE .git (same precedent as .git/modules) and the alternates path
// is relative, so it survives every container mount scheme: `container:` jobs (/__w),
// Docker container actions (/github/workspace), and `docker build COPY .`.
//
// Everything here is fail-open: any error or timeout degrades to stock actions/checkout
// behavior with a warning, never a failed checkout.

const MIRROR_DIR = 'wb-mirror.git'
export const ALTERNATES_CONTENT = `../${MIRROR_DIR}/objects\n`

const DOWNLOAD_TIMEOUT_MS = 15 * 60_000
const UPLOAD_TIMEOUT_MS = 15 * 60_000

// Skip reason for "not a WarpBuild runner" — logged at debug (it is the normal state
// everywhere outside WarpBuild); every other reason is logged at info.
export const SKIP_NOT_WARPBUILD =
  'not running on a WarpBuild runner (WARPBUILD_* env not present)'

export function mirrorPath(repositoryPath: string): string {
  return path.join(repositoryPath, '.git', MIRROR_DIR)
}

// getMirrorCacheSkipReason gates the whole feature. Returns null when the mirror cache
// should be attempted, otherwise a human-readable reason to log. Cheap, pure, and
// deliberately strict: anything unexpected means "behave exactly like upstream".
export function getMirrorCacheSkipReason(
  settings: IGitSourceSettings
): string | null {
  // Only on WarpBuild runners (these are injected into every job's env there).
  if (
    !process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN'] ||
    !process.env['WARPBUILD_HOST_URL']
  ) {
    return SKIP_NOT_WARPBUILD
  }
  // Linux + macOS in v1.
  if (process.platform === 'win32') {
    return 'Windows is not supported by the mirror cache yet'
  }
  // The cache key is GITHUB_REPOSITORY_ID, which belongs to the WORKFLOW repo — so only
  // cache when that is what is being checked out (`repository:` inputs fall back).
  const repoKey = process.env['GITHUB_REPOSITORY_ID'] || ''
  if (!repoKey) {
    return 'GITHUB_REPOSITORY_ID is not set'
  }
  const checkoutRepo = `${settings.repositoryOwner}/${settings.repositoryName}`
  if (checkoutRepo !== process.env['GITHUB_REPOSITORY']) {
    return `repository '${checkoutRepo}' is not the workflow repository '${process.env['GITHUB_REPOSITORY']}'`
  }
  // github.com only (repo ids and mirror keys assume it).
  const server = (settings.githubServerUrl || 'https://github.com').replace(
    /\/+$/,
    ''
  )
  if (server !== 'https://github.com') {
    return `server '${server}' is not github.com`
  }
  return null
}

// setup is the single upstream splice point, called right after `git init` +
// `git remote add` for a fresh repository. It never throws.
export async function setup(
  settings: IGitSourceSettings,
  repositoryUrl: string
): Promise<void> {
  const skipReason = getMirrorCacheSkipReason(settings)
  if (skipReason) {
    if (skipReason === SKIP_NOT_WARPBUILD) {
      core.debug(`WarpBuild mirror cache skipped: ${skipReason}`)
    } else {
      core.info(`WarpBuild mirror cache skipped: ${skipReason}`)
    }
    return
  }
  core.startGroup('WarpBuild: setting up git mirror cache')
  try {
    await setupInner(settings, repositoryUrl)
  } catch (error) {
    core.warning(
      `WarpBuild mirror cache unavailable, using standard checkout: ${error}`
    )
  } finally {
    core.endGroup()
  }
}

async function setupInner(
  settings: IGitSourceSettings,
  repositoryUrl: string
): Promise<void> {
  const repoKey = process.env['GITHUB_REPOSITORY_ID'] as string
  const mirror = mirrorPath(settings.repositoryPath)

  // A second checkout of the same repo in one job finds the mirror already in place.
  if (fs.existsSync(path.join(mirror, 'objects'))) {
    core.info('Mirror already present, reusing it')
    await writeAlternates(settings.repositoryPath)
    return
  }

  const lookup = await api.lookupMirror(repoKey)

  if (lookup.kind === 'disabled') {
    core.info(
      'Mirror cache is disabled by the backend for this organization; using standard checkout'
    )
    return
  }

  if (lookup.kind === 'error') {
    core.info('Mirror cache backend unavailable; using standard checkout')
    return
  }

  if (lookup.kind === 'hit') {
    core.info(
      `Cache hit: restoring mirror (${lookup.info.size_bytes} bytes, created ${lookup.info.created_at})`
    )
    if (await restoreMirror(lookup.info.url, mirror)) {
      await writeAlternates(settings.repositoryPath)
      core.info('Mirror restored; the fetch below downloads only the delta')
    }
    return
  }

  // Miss. Probe upload authorization BEFORE the expensive clone so a disabled or
  // unreachable backend never costs a wasted full mirror clone.
  const probe = await api.requestUploadURL(repoKey)
  if (probe.kind !== 'ok') {
    core.info(
      probe.kind === 'disabled'
        ? 'Mirror cache is disabled by the backend for this organization; using standard checkout'
        : 'Mirror cache backend unavailable; skipping mirror creation'
    )
    return
  }

  core.info(
    'Cache miss: downloading all branches and tags from GitHub into a fresh mirror (one-time; later runs download only the delta)'
  )
  await createMirrorFromGitHub(settings, repositoryUrl, mirror)
  await writeAlternates(settings.repositoryPath)
  // Upload failures only warn: the local mirror still accelerates THIS run.
  await uploadMirror(repoKey, mirror)
}

// writeAlternates points the workspace repo's object lookups at the mirror. The path is
// RELATIVE (resolved against .git/objects), which is what makes container remaps safe.
export async function writeAlternates(repositoryPath: string): Promise<void> {
  const infoDir = path.join(repositoryPath, '.git', 'objects', 'info')
  await fs.promises.mkdir(infoDir, {recursive: true})
  await fs.promises.writeFile(
    path.join(infoDir, 'alternates'),
    ALTERNATES_CONTENT
  )
  core.info(
    `Wrote .git/objects/info/alternates -> ${ALTERNATES_CONTENT.trim()}`
  )
}

async function restoreMirror(url: string, mirror: string): Promise<boolean> {
  const tmpTar = path.join(os.tmpdir(), `wb-mirror-restore-${process.pid}.tar`)
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    })
    if (!res.ok || !res.body) {
      throw new Error(`mirror download answered ${res.status}`)
    }
    await pipeline(
      Readable.fromWeb(res.body as import('stream/web').ReadableStream),
      fs.createWriteStream(tmpTar)
    )
    await fs.promises.mkdir(mirror, {recursive: true})
    await exec.exec('tar', ['-xf', tmpTar, '-C', mirror])
    return true
  } catch (error) {
    core.warning(`Mirror restore failed: ${error}`)
    // Never leave a partial mirror behind an alternates file — that is corruption.
    await fs.promises.rm(mirror, {recursive: true, force: true})
    return false
  } finally {
    await fs.promises.rm(tmpTar, {force: true})
  }
}

// createMirrorFromGitHub builds the bare mirror by downloading the repository from
// GitHub — the one heavy operation in the whole design, paid once per repo per TTL.
// Scope is deliberately branches + tags only (NOT `clone --mirror`, which would also
// copy refs/pull/* — every PR head ever opened, unbounded growth and often a large
// share of the download on PR-heavy repos). PR-triggered checkouts still work: their
// head SHA simply arrives as a small delta in the workspace fetch.
//
// The full history download itself cannot be safely avoided: a shallow or partial
// mirror behind an alternates file is an incomplete object store that git assumes is
// complete — the exact corruption Blacksmith hit and reverted. A mirror must be
// complete with respect to the refs it advertises.
async function createMirrorFromGitHub(
  settings: IGitSourceSettings,
  repositoryUrl: string,
  mirror: string
): Promise<void> {
  // Same header shape as upstream auth, but passed via GIT_CONFIG_* env vars
  // (git >= 2.31) so the credential never appears in any process's argv.
  const basicCredential = Buffer.from(
    `x-access-token:${settings.authToken}`,
    'utf8'
  ).toString('base64')
  core.setSecret(basicCredential)

  const env: {[key: string]: string} = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  env['GIT_CONFIG_COUNT'] = '1'
  env['GIT_CONFIG_KEY_0'] = 'http.https://github.com/.extraheader'
  env['GIT_CONFIG_VALUE_0'] = `AUTHORIZATION: basic ${basicCredential}`

  await exec.exec('git', ['init', '--bare', '--quiet', mirror], {env})
  await exec.exec(
    'git',
    ['-C', mirror, 'remote', 'add', 'origin', repositoryUrl],
    {
      env
    }
  )
  // gc.auto=0: never let the fetch spawn a detached gc that outlives the step.
  await exec.exec(
    'git',
    [
      '-c',
      'gc.auto=0',
      '-C',
      mirror,
      'fetch',
      '--prune',
      '--progress',
      'origin',
      '+refs/heads/*:refs/heads/*',
      '+refs/tags/*:refs/tags/*'
    ],
    {env}
  )
}

async function uploadMirror(repoKey: string, mirror: string): Promise<void> {
  const tmpTar = path.join(os.tmpdir(), `wb-mirror-upload-${process.pid}.tar`)
  try {
    // Plain tar, no gzip (pack data is already zlib-compressed). Excludes are cosmetic
    // trims; the tar stays a valid bare repo either way.
    await exec.exec('tar', [
      '-cf',
      tmpTar,
      '-C',
      mirror,
      '--exclude',
      './hooks',
      '--exclude',
      './description',
      '--exclude',
      './FETCH_HEAD',
      '.'
    ])
    const size = (await fs.promises.stat(tmpTar)).size

    // Fresh URL after the potentially long clone+tar (presigned PUTs expire). If the
    // backend flipped to disabled meanwhile, this answers 403 and the upload is skipped.
    const fresh = await api.requestUploadURL(repoKey)
    if (fresh.kind !== 'ok') {
      throw new Error(
        fresh.kind === 'disabled'
          ? 'mirror cache was disabled by the backend'
          : 'upload-url unavailable'
      )
    }

    const init: RequestInit & {duplex: 'half'} = {
      method: 'PUT',
      headers: {
        'content-length': String(size),
        'content-type': 'application/x-tar'
      },
      body: Readable.toWeb(
        fs.createReadStream(tmpTar)
      ) as unknown as ReadableStream,
      duplex: 'half',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
    }
    const res = await fetch(fresh.url, init)
    if (!res.ok) {
      throw new Error(`mirror upload answered ${res.status}`)
    }
    core.info(`Mirror uploaded (${size} bytes); future runs will restore it`)
  } catch (error) {
    core.warning(`Mirror upload skipped: ${error}`)
  } finally {
    await fs.promises.rm(tmpTar, {force: true})
  }
}
