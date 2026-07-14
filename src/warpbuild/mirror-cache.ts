/* eslint-disable i18n-text/no-en, import/no-unresolved -- upstream conventions; no TS import resolver configured */
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import {HttpClient} from '@actions/http-client'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {pipeline} from 'stream/promises'
import {IGitSourceSettings} from '../git-source-settings.js'
import * as api from './backend-api.js'

// WarpBuild checkout cache: a bare base mirror + per-branch orderless delta bundles on
// S3. We seed the base (+ this branch's delta) before the fetch, so the GitHub fetch is
// only the tip delta — or nothing. Each run overwrites its branch's bundle (base-relative,
// so order-free); a cold repo single-flights the base build. Fail-open: any error →
// standard checkout.

const UPLOAD_TIMEOUT_MS = 15 * 60_000

// Concurrent range-download tuning, matched to WarpBuilds/cache: 4 MiB blocks, 8-wide, over a
// keep-alive http.Agent. A single stream saturates at the per-connection ceiling (~15 MB/s on a
// WAN); parallel range GETs reach link rate (~200 MB/s).
const SEGMENT_SIZE = 4 * 1024 * 1024
const SEGMENT_CONCURRENCY = 8
const SEGMENT_TIMEOUT_MS = 30_000
const SEGMENT_RETRIES = 5

// Logged at info when off; the WARPBUILD_* env is only present on our runners.
export const SKIP_NOT_WARPBUILD =
  'not running on a WarpBuild runner (WARPBUILD_* env not present)'

const SHA_PATTERN = /^[0-9a-f]{40}([0-9a-f]{24})?$/

// Seeded bundles land here, out of the user's ref space; excluded objects for deltas.
const BASE_REFNS = 'refs/wb/base'
const BRANCH_REFNS = 'refs/wb/branch'
const UPLOAD_TIP_REF = 'refs/wb/tip'

export type MirrorMode = 'off' | 'seeded' | 'cold-build'

interface Plan {
  mode: MirrorMode
  repoKey: string
  refKey: string
  baseUploadUrl?: string // cold-build only
}
let plan: Plan = {mode: 'off', repoKey: '', refKey: ''}

// Null = attempt the cache; else a reason to log. We engage only where the result matches
// upstream: full history (fetch-depth 0) or the default depth 1. An explicit shallow depth
// (>= 2) is a deliberate request we can't honour (the mirror is full history), so we defer
// to upstream. sparse/filter change the object set we model, so they defer too. LFS does
// NOT defer: the bundle carries the git objects (including LFS pointer blobs), and the
// stock `git lfs fetch`/`checkout` steps pull the actual LFS binaries from GitHub on top,
// exactly as upstream — the mirror only accelerates the git-object half.
export function getMirrorCacheSkipReason(
  settings: IGitSourceSettings
): string | null {
  if (
    !process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN'] ||
    !process.env['WARPBUILD_HOST_URL']
  ) {
    return SKIP_NOT_WARPBUILD
  }
  if (!process.env['GITHUB_REPOSITORY_ID']) {
    return 'GITHUB_REPOSITORY_ID is not set'
  }
  const checkoutRepo = `${settings.repositoryOwner}/${settings.repositoryName}`
  if (checkoutRepo !== process.env['GITHUB_REPOSITORY']) {
    return `repository '${checkoutRepo}' is not the workflow repository '${process.env['GITHUB_REPOSITORY']}'`
  }
  const server = (settings.githubServerUrl || 'https://github.com').replace(
    /\/+$/,
    ''
  )
  if (server !== 'https://github.com') {
    return `server '${server}' is not github.com`
  }
  if (!settings.commit || !SHA_PATTERN.test(settings.commit)) {
    return 'no exact commit sha to key on'
  }
  // Respect an explicit shallow request: depth 0 (all) and the default depth 1 engage the
  // mirror; anything deeper is a deliberate shallow the mirror can't reproduce → upstream.
  if (settings.fetchDepth > 1) {
    return `fetch-depth ${settings.fetchDepth} is an explicit shallow depth; using upstream checkout`
  }
  if (settings.filter) {
    return 'a fetch filter is configured'
  }
  if (settings.sparseCheckout) {
    return 'sparse checkout is configured'
  }
  // LFS intentionally does not skip — see the note above getMirrorCacheSkipReason.
  return null
}

// The durable branch to key the per-branch bundle on. For pull_request events the merge
// SHA is synthetic, so we key on the base branch; otherwise the pushed branch. '' for
// tags / detached HEAD → seed the base only, upload nothing.
export function computeRefKey(settings: IGitSourceSettings): string {
  const baseRef = process.env['GITHUB_BASE_REF'] // set on pull_request events
  if (baseRef) {
    return baseRef
  }
  const ref = process.env['GITHUB_REF'] || settings.ref || ''
  if (ref.startsWith('refs/heads/')) {
    return ref.substring('refs/heads/'.length)
  }
  if (ref.startsWith('refs/tags/') || ref.startsWith('refs/pull/')) {
    return ''
  }
  // Already a short branch name, or empty.
  return SHA_PATTERN.test(ref) ? '' : ref
}

// Runs after `git init`, before the fetch. Returns the mode the fetch/contribute steps
// branch on. Never throws. Sets the `cache-hit` output (true only when seeded from cache).
export async function setup(settings: IGitSourceSettings): Promise<MirrorMode> {
  const mode = await setupImpl(settings)
  core.setOutput('cache-hit', mode === 'seeded' ? 'true' : 'false')
  return mode
}

// Called by getSource when a mirror-seeded fetch fails: clear our refs and disengage, so
// the caller can retry the standard fetch against a clean repo. Also re-sets cache-hit to
// false since we're no longer serving from cache.
export async function abandon(settings: IGitSourceSettings): Promise<void> {
  plan = {mode: 'off', repoKey: '', refKey: ''}
  core.setOutput('cache-hit', 'false')
  await cleanupWbRefs(settings.repositoryPath)
}

async function setupImpl(settings: IGitSourceSettings): Promise<MirrorMode> {
  plan = {mode: 'off', repoKey: '', refKey: ''}
  const skipReason = getMirrorCacheSkipReason(settings)
  if (skipReason) {
    core.info(`WarpBuild mirror cache skipped: ${skipReason}`)
    return 'off'
  }
  core.startGroup('WarpBuild: checkout mirror cache')
  try {
    return await setupInner(settings)
  } catch (error) {
    core.warning(
      `WarpBuild mirror cache unavailable, using standard checkout: ${error}`
    )
    // A partial seed may have left refs/wb/*; strip it so the stock fetch runs against a
    // clean repo (objects just dangle harmlessly).
    await cleanupWbRefs(settings.repositoryPath)
    return 'off'
  } finally {
    core.endGroup()
  }
}

async function setupInner(settings: IGitSourceSettings): Promise<MirrorMode> {
  const repoKey = process.env['GITHUB_REPOSITORY_ID'] as string
  const refKey = computeRefKey(settings)
  plan = {mode: 'off', repoKey, refKey}

  const lookup = await api.lookupRestore(repoKey, refKey)
  if (lookup.kind === 'disabled') {
    core.info('Mirror cache is disabled by the backend for this organization')
    return 'off'
  }
  if (lookup.kind === 'error') {
    core.info('Mirror cache backend unavailable; using standard checkout')
    return 'off'
  }

  if (lookup.kind === 'cold') {
    const grant = await api.requestBaseUpload(repoKey)
    if (grant.kind === 'grant') {
      core.info(
        'Cold repo: building the base mirror this run (full fetch, then upload)'
      )
      plan = {mode: 'cold-build', repoKey, refKey, baseUploadUrl: grant.url}
      return 'cold-build'
    }
    core.info(
      'Cold repo: base build already in progress elsewhere; using standard checkout'
    )
    return 'off'
  }

  // Restore: seed the base, then this branch's delta if present.
  await seedBundle(settings.repositoryPath, lookup.base.url, BASE_REFNS)
  // Full-history checkout: mirror the base's branches + tags into refs/remotes/origin/* +
  // refs/tags/* so the resulting .git matches an upstream `fetch-depth: 0` checkout (the
  // delta fetch then advances the target ref to its current tip). A shallow upstream fetch
  // (depth 1) populates only the target ref, so there we keep the base internal and let the
  // delta fetch provide just that ref.
  if (settings.fetchDepth <= 0) {
    await exposeBaseRefs(settings.repositoryPath)
  }
  if (lookup.branch) {
    try {
      await seedBundle(settings.repositoryPath, lookup.branch.url, BRANCH_REFNS)
    } catch (error) {
      core.info(`Branch delta seed skipped (${error}); base only`)
    }
  }
  core.info(
    `Seeded base mirror${
      lookup.branch ? ' + branch delta' : ''
    }; the GitHub fetch will be a tip delta`
  )
  plan = {mode: 'seeded', repoKey, refKey}
  return 'seeded'
}

// Runs LAST in getSource — the checkout has already succeeded. Uploads the base (cold) or
// this branch's refreshed delta (seeded). Hardened so it can NEVER fail the step: its own
// try/catch for normal errors, plus scoped process guards (installed only for the upload
// window) that turn an *uncaught* error from the git/upload work — e.g. a spawn error that
// bypasses the promise chain, like the arg-length crash we hit on Windows — into a clean
// exit(0). Safe because nothing checkout-relevant runs after this point.
export async function contribute(settings: IGitSourceSettings): Promise<void> {
  if (plan.mode !== 'cold-build' && plan.mode !== 'seeded') {
    return
  }
  const guard = (error: unknown): void => {
    core.warning(
      `WarpBuild mirror upload error ignored — checkout already complete: ${error}`
    )
    process.exit(0)
  }
  process.on('uncaughtException', guard)
  process.on('unhandledRejection', guard)
  try {
    if (plan.mode === 'cold-build') {
      await uploadBaseMirror(settings)
    } else {
      await uploadBranchDelta(settings)
    }
  } catch (error) {
    core.warning(`WarpBuild mirror upload skipped: ${error}`)
  } finally {
    // Seeded mode created the internal refs/wb/* namespace; strip it so the customer's
    // .git carries no mirror fingerprint (matches upstream; won't break push --mirror).
    if (plan.mode === 'seeded') {
      await cleanupWbRefs(settings.repositoryPath)
    }
    process.removeListener('uncaughtException', guard)
    process.removeListener('unhandledRejection', guard)
  }
}

// Download a bundle and fetch its refs into refNs/* so its objects seed the local repo
// (and count as "haves" for the delta negotiation). The bundle is a git-validated file;
// nothing is extracted into .git directly.
async function seedBundle(
  repoPath: string,
  url: string,
  refNs: string
): Promise<void> {
  const tmp = tempBundlePath('seed')
  const what = refNs === BASE_REFNS ? 'base' : 'branch'
  try {
    await downloadTo(url, tmp, what)
    await exec.exec('git', [
      '-C',
      repoPath,
      'fetch',
      '--quiet',
      '--no-tags',
      tmp,
      `+refs/*:${refNs}/*`
    ])
  } finally {
    await fs.promises.rm(tmp, {force: true})
  }
}

// Copy the seeded base's branches + tags out to the namespaces upstream uses
// (refs/remotes/origin/* + refs/tags/*), so a full-history checkout's .git matches
// upstream. Runs before the delta fetch, while the target ref is still absent, so the
// `create` directives don't collide. update-ref --stdin keeps it Windows arg-length safe.
async function exposeBaseRefs(repoPath: string): Promise<void> {
  let out = ''
  await exec.exec(
    'git',
    [
      '-C',
      repoPath,
      'for-each-ref',
      '--format=create refs/%(refname:lstrip=3) %(objectname)',
      `${BASE_REFNS}/remotes/origin`,
      `${BASE_REFNS}/tags`
    ],
    {silent: true, listeners: {stdout: (d: Buffer) => (out += d.toString())}}
  )
  if (!out.trim()) {
    return
  }
  await exec.exec('git', ['-C', repoPath, 'update-ref', '--stdin'], {
    input: Buffer.from(out)
  })
}

// Remove the internal refs/wb/* namespace. Objects stay (reachable from the real refs), so
// the checkout is unaffected; only the mirror's bookkeeping refs go. Best-effort.
async function cleanupWbRefs(repoPath: string): Promise<void> {
  try {
    let out = ''
    await exec.exec(
      'git',
      ['-C', repoPath, 'for-each-ref', '--format=delete %(refname)', 'refs/wb'],
      {silent: true, listeners: {stdout: (d: Buffer) => (out += d.toString())}}
    )
    if (!out.trim()) {
      return
    }
    await exec.exec('git', ['-C', repoPath, 'update-ref', '--stdin'], {
      input: Buffer.from(out)
    })
  } catch (error) {
    core.debug(`WarpBuild ref cleanup skipped: ${error}`)
  }
}

// Cold-build: after the forced full fetch the repo holds all branches under
// refs/remotes/origin/* and all tags. Bundle exactly those (not `--all`, which would
// also sweep up the ephemeral triggering PR merge ref) as the base and upload.
async function uploadBaseMirror(settings: IGitSourceSettings): Promise<void> {
  if (!plan.baseUploadUrl) {
    return
  }
  const tmp = tempBundlePath('base')
  try {
    await exec.exec('git', [
      '-C',
      settings.repositoryPath,
      'bundle',
      'create',
      tmp,
      '--remotes=origin',
      '--tags'
    ])
    await httpPut(plan.baseUploadUrl, tmp)
    core.info('Uploaded base mirror')
  } finally {
    await fs.promises.rm(tmp, {force: true})
  }
}

// Seeded: build the base-relative delta (target sha, excluding everything in the base)
// and overwrite this branch's bundle. Guarded by a per-branch lock server-side.
async function uploadBranchDelta(settings: IGitSourceSettings): Promise<void> {
  if (!plan.refKey) {
    return // tag / detached HEAD: nothing to roll
  }
  const repoPath = settings.repositoryPath
  const sha = settings.commit

  await exec.exec('git', ['-C', repoPath, 'update-ref', UPLOAD_TIP_REF, sha])
  try {
    if (!(await hasBaseRefs(repoPath))) {
      core.info('No base refs to diff against; branch delta skipped')
      return
    }
    // If the tip is already in the base there is no delta to roll, and `git bundle
    // create` errors on an empty range ("Refusing to create empty bundle"). Detect it
    // first — and before taking the server lock, so an empty delta never blocks the
    // other jobs racing the same branch.
    if (await branchDeltaIsEmpty(repoPath)) {
      core.info('Tip already contained in the base; no branch delta to upload')
      return
    }

    const grant = await api.requestBranchUpload(plan.repoKey, plan.refKey, sha)
    if (grant.kind !== 'grant') {
      core.info(`Branch delta upload skipped (${grant.kind})`)
      return
    }

    const tmp = tempBundlePath('branch')
    try {
      // Exclude the base with a single --glob, not one `^ref` arg per ref: a large repo
      // has hundreds of base refs, and that many args overflows the Windows command-line
      // limit (ENAMETOOLONG). The glob matches the multi-level seeded refs and yields the
      // same base-relative (order-free) delta.
      await exec.exec('git', [
        '-C',
        repoPath,
        'bundle',
        'create',
        tmp,
        UPLOAD_TIP_REF,
        '--not',
        `--glob=${BASE_REFNS}/*`
      ])
      await httpPut(grant.url, tmp)
      core.info(`Uploaded branch delta for '${plan.refKey}'`)
    } finally {
      await fs.promises.rm(tmp, {force: true})
    }
  } finally {
    await exec.exec(
      'git',
      ['-C', repoPath, 'update-ref', '-d', UPLOAD_TIP_REF],
      {
        ignoreReturnCode: true
      }
    )
  }
}

// The tip's delta against the base is empty when the tip is already reachable from the
// base — nothing new to bundle.
async function branchDeltaIsEmpty(repoPath: string): Promise<boolean> {
  let out = ''
  await exec.exec(
    'git',
    [
      '-C',
      repoPath,
      'rev-list',
      '--count',
      UPLOAD_TIP_REF,
      '--not',
      `--glob=${BASE_REFNS}/*`
    ],
    {silent: true, listeners: {stdout: (d: Buffer) => (out += d.toString())}}
  )
  return out.trim() === '0'
}

// Whether any base ref was seeded — the guard that keeps the delta base-relative. The
// base is excluded by glob (see uploadBranchDelta), so we only need existence here.
async function hasBaseRefs(repoPath: string): Promise<boolean> {
  let out = ''
  await exec.exec(
    'git',
    ['-C', repoPath, 'for-each-ref', '--count=1', '--format=1', BASE_REFNS],
    {silent: true, listeners: {stdout: (d: Buffer) => (out += d.toString())}}
  )
  return out.trim().length > 0
}

// Download a presigned GET to dest with concurrent HTTP range requests, so the base bundle
// (tens/hundreds of MiB) transfers at link rate instead of the single-stream ~15 MB/s ceiling.
// Falls back to a single stream when the server doesn't support ranges.
async function downloadTo(
  url: string,
  dest: string,
  what: string
): Promise<void> {
  const started = Date.now()
  // Keep-alive http.Agent (like WarpBuilds/cache) — real parallel sockets; bare fetch under-parallelizes.
  const http = new HttpClient('warpbuild-checkout-mirror', undefined, {
    socketTimeout: SEGMENT_TIMEOUT_MS,
    keepAlive: true
  })
  try {
    const total = await probeRangeSize(http, url)
    if (total === null) {
      await downloadSingleStream(http, url, dest)
      const bytes = (await fs.promises.stat(dest)).size
      core.info(
        `Mirror download [${what}]: ${fmtSize(bytes)} single-stream, no range support, ${fmtElapsed(started, bytes)}`
      )
      return
    }
    const segments: [number, number][] = []
    for (let off = 0; off < total; off += SEGMENT_SIZE) {
      segments.push([off, Math.min(SEGMENT_SIZE, total - off)])
    }
    const width = Math.min(SEGMENT_CONCURRENCY, segments.length)
    const fh = await fs.promises.open(dest, 'w')
    try {
      let next = 0
      const worker = async (): Promise<void> => {
        for (;;) {
          const i = next++
          if (i >= segments.length) {
            return
          }
          const [offset, count] = segments[i]
          const buf = await downloadSegment(http, url, offset, count)
          await fh.write(buf, 0, count, offset)
        }
      }
      const pool: Promise<void>[] = []
      for (let k = 0; k < width; k++) {
        pool.push(worker())
      }
      await Promise.all(pool)
    } finally {
      await fh.close()
    }
    core.info(
      `Mirror download [${what}]: ${fmtSize(total)} in ${segments.length} ranged segments ×${width}, ${fmtElapsed(started, total)}`
    )
  } finally {
    http.dispose()
  }
}

// Size + elapsed/throughput for the mirror download o11y line.
function fmtSize(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`
}
function fmtElapsed(startedMs: number, bytes: number): string {
  const secs = (Date.now() - startedMs) / 1000
  const rate = secs > 0 ? (bytes / 1e6 / secs).toFixed(1) : 'n/a'
  return `${secs.toFixed(2)}s (${rate} MB/s)`
}

// GET bytes=0-0 to learn the total size and confirm range support; null → not supported.
async function probeRangeSize(
  http: HttpClient,
  url: string
): Promise<number | null> {
  const res = await http.get(url, {Range: 'bytes=0-0'})
  if (res.message.statusCode !== 206) {
    res.message.destroy() // no range support; don't read a full 200 body into memory
    return null
  }
  await res.readBody() // 1 byte; return the socket to the keep-alive pool
  const contentRange = res.message.headers['content-range']
  const match =
    typeof contentRange === 'string' ? contentRange.match(/\/(\d+)\s*$/) : null
  const total = match ? parseInt(match[1], 10) : NaN
  return Number.isFinite(total) && total > 0 ? total : null
}

// One range GET with retries over the shared keep-alive client; returns exactly `count` bytes.
async function downloadSegment(
  http: HttpClient,
  url: string,
  offset: number,
  count: number
): Promise<Buffer> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= SEGMENT_RETRIES; attempt++) {
    try {
      const res = await http.get(url, {
        Range: `bytes=${offset}-${offset + count - 1}`
      })
      if (res.message.statusCode !== 206) {
        await res.readBody() // drain before retrying so the socket is reusable
        throw new Error(`range GET answered ${res.message.statusCode}`)
      }
      const buf = await res.readBodyBuffer?.()
      if (!buf) {
        throw new Error('http-client response lacks readBodyBuffer')
      }
      if (buf.length !== count) {
        throw new Error(`short segment at ${offset}: ${buf.length}/${count}`)
      }
      return buf
    } catch (error) {
      lastErr = error
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`segment at ${offset} failed`)
}

async function downloadSingleStream(
  http: HttpClient,
  url: string,
  dest: string
): Promise<void> {
  const res = await http.get(url)
  const status = res.message.statusCode ?? 0
  if (status < 200 || status >= 300) {
    await res.readBody()
    throw new Error(`download answered ${status}`)
  }
  await pipeline(res.message, fs.createWriteStream(dest))
}

async function httpPut(url: string, file: string): Promise<void> {
  const stat = await fs.promises.stat(file)
  const res = await fetch(url, {
    method: 'PUT',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- node stream body
    body: fs.createReadStream(file) as any,
    duplex: 'half',
    headers: {'content-length': String(stat.size)},
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- duplex not yet typed
  } as any)
  if (!res.ok) {
    throw new Error(`PUT answered ${res.status}`)
  }
}

// Bundles live in a private mkdtemp'd dir (0700) — a co-tenant can't pre-empt a write via a
// planted symlink, and mkdtempSync is the primitive CodeQL accepts (js/insecure-temporary-file).
let mirrorTmpDir: string | undefined
function tempBundlePath(tag: string): string {
  if (!mirrorTmpDir) {
    mirrorTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-mirror-'))
  }
  return path.join(
    mirrorTmpDir,
    `wb-${tag}-${crypto.randomBytes(12).toString('hex')}.bundle`
  )
}

// Kept for callers/tests: reset .git/objects to the empty `git init` shape.
export async function resetGitObjects(gitDir: string): Promise<void> {
  await fs.promises.rm(path.join(gitDir, 'objects'), {
    recursive: true,
    force: true
  })
  await fs.promises.rm(path.join(gitDir, 'shallow'), {force: true})
  await fs.promises.mkdir(path.join(gitDir, 'objects', 'info'), {
    recursive: true
  })
  await fs.promises.mkdir(path.join(gitDir, 'objects', 'pack'), {
    recursive: true
  })
}

// Kept so tests referencing io stay valid; the mirror path no longer shells to `tar`.
export async function hasGit(): Promise<boolean> {
  return Boolean(await io.which('git', false))
}
