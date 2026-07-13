/* eslint-disable i18n-text/no-en, import/no-unresolved -- upstream conventions; no TS import resolver configured */
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {IGitSourceSettings} from '../git-source-settings.js'
import * as api from './backend-api.js'

// WarpBuild checkout cache: a bare base mirror + per-branch orderless delta bundles on
// S3. We seed the base (+ this branch's delta) before the fetch, so the GitHub fetch is
// only the tip delta — or nothing. Each run overwrites its branch's bundle (base-relative,
// so order-free); a cold repo single-flights the base build. Fail-open: any error →
// standard checkout.

const DOWNLOAD_TIMEOUT_MS = 15 * 60_000
const UPLOAD_TIMEOUT_MS = 15 * 60_000

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

// Null = attempt the cache; else a reason to log. The mirror serves full history for any
// depth, so fetch-depth is not gated; sparse/lfs/filter change the object set we model.
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
  if (settings.filter) {
    return 'a fetch filter is configured'
  }
  if (settings.sparseCheckout) {
    return 'sparse checkout is configured'
  }
  if (settings.lfs) {
    return 'lfs is enabled (lfs objects are not in the mirror)'
  }
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

// Runs after checkout, in the same step (`.git` still pristine). Uploads the base (cold)
// or this branch's refreshed delta (seeded). Best-effort — never fails the checkout.
export async function contribute(settings: IGitSourceSettings): Promise<void> {
  try {
    if (plan.mode === 'cold-build') {
      await uploadBaseMirror(settings)
    } else if (plan.mode === 'seeded') {
      await uploadBranchDelta(settings)
    }
  } catch (error) {
    core.warning(`WarpBuild mirror upload skipped: ${error}`)
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
  try {
    await downloadTo(url, tmp)
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

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  })
  if (!res.ok || !res.body) {
    throw new Error(`download answered ${res.status}`)
  }
  await pipeline(
    Readable.fromWeb(res.body as import('stream/web').ReadableStream),
    fs.createWriteStream(dest)
  )
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

function tempBundlePath(tag: string): string {
  return path.join(os.tmpdir(), `wb-${tag}-${process.pid}-${Date.now()}.bundle`)
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
