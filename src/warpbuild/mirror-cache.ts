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

// WarpBuild checkout snapshot cache: SHA-keyed tars of what the stock shallow fetch
// produces. Hit = restore + skip the fetch; miss = upload after checkout. Keys are
// immutable (no expiry). Fail-open: any error degrades to stock behavior.

const DOWNLOAD_TIMEOUT_MS = 15 * 60_000

// Logged at debug (normal state outside WarpBuild); other reasons log at info.
export const SKIP_NOT_WARPBUILD =
  'not running on a WarpBuild runner (WARPBUILD_* env not present)'

const SHA_PATTERN = /^[0-9a-f]{40}([0-9a-f]{24})?$/

let decision: 'off' | 'miss' = 'off'

// Null = attempt the cache; else a reason to log. Only the default checkout shape
// is served.
export function getMirrorCacheSkipReason(
  settings: IGitSourceSettings
): string | null {
  if (
    !process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN'] ||
    !process.env['WARPBUILD_HOST_URL']
  ) {
    return SKIP_NOT_WARPBUILD
  }
  const repoKey = process.env['GITHUB_REPOSITORY_ID'] || ''
  if (!repoKey) {
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
  if (settings.fetchDepth !== 1) {
    return `fetch-depth is ${settings.fetchDepth}, cache only serves fetch-depth 1`
  }
  if (settings.fetchTags) {
    return 'fetch-tags is enabled'
  }
  if (settings.filter) {
    return 'a fetch filter is configured'
  }
  if (settings.sparseCheckout) {
    return 'sparse checkout is configured'
  }
  if (settings.lfs) {
    return 'lfs is enabled (lfs objects are not in the snapshot)'
  }
  if (settings.ref && computeDestinationRef(settings.ref) === null) {
    return `ref '${settings.ref}' has no cacheable destination ref`
  }
  return null
}

// The local ref the fetch would have created ('' = none needed, null = uncacheable).
export function computeDestinationRef(ref: string): string | null {
  if (!ref) {
    return ''
  }
  const upper = ref.toUpperCase()
  if (upper.startsWith('REFS/HEADS/')) {
    return `refs/remotes/origin/${ref.substring('refs/heads/'.length)}`
  }
  if (upper.startsWith('REFS/PULL/')) {
    return `refs/remotes/pull/${ref.substring('refs/pull/'.length)}`
  }
  if (upper.startsWith('REFS/TAGS/')) {
    return ref
  }
  return null
}

// Runs right after `git init`; true = restored (caller skips the fetch). Never throws.
// Sets the `cache-hit` action output (true only on a restore).
export async function setup(settings: IGitSourceSettings): Promise<boolean> {
  const restored = await setupImpl(settings)
  core.setOutput('cache-hit', restored ? 'true' : 'false')
  return restored
}

async function setupImpl(settings: IGitSourceSettings): Promise<boolean> {
  decision = 'off'
  const skipReason = getMirrorCacheSkipReason(settings)
  if (skipReason) {
    core.info(`WarpBuild snapshot cache skipped: ${skipReason}`)
    return false
  }
  core.startGroup('WarpBuild: checkout snapshot cache')
  try {
    return await setupInner(settings)
  } catch (error) {
    core.warning(
      `WarpBuild snapshot cache unavailable, using standard checkout: ${error}`
    )
    return false
  } finally {
    core.endGroup()
  }
}

async function setupInner(settings: IGitSourceSettings): Promise<boolean> {
  const repoKey = process.env['GITHUB_REPOSITORY_ID'] as string
  const sha = settings.commit

  // The restore/upload paths shell out to `tar`; without it, fall back cleanly.
  if (!(await io.which('tar', false))) {
    core.info('tar not found on PATH; using standard checkout')
    return false
  }

  const lookup = await api.lookupSnapshot(repoKey, sha)

  if (lookup.kind === 'disabled') {
    core.info('Snapshot cache is disabled by the backend for this organization')
    return false
  }
  if (lookup.kind === 'error') {
    core.info('Snapshot cache backend unavailable; using standard checkout')
    return false
  }

  if (lookup.kind === 'miss') {
    core.info(
      `Cache miss for ${sha}: the standard fetch will run and its result will be uploaded`
    )
    decision = 'miss'
    return false
  }

  core.info(
    `Cache hit for ${sha}: restoring snapshot (${lookup.info.size_bytes} bytes)`
  )
  if (!(await restoreSnapshot(settings, lookup.info.url, sha))) {
    return false
  }
  core.info('Snapshot restored; skipping the GitHub fetch entirely')
  return true
}

// Runs after checkout; on a miss records a manifest so the WarpBuild agent uploads the
// snapshot after the job exits (keeping tar+upload off the customer's billed time).
export async function contribute(settings: IGitSourceSettings): Promise<void> {
  if (decision !== 'miss') {
    return
  }
  try {
    await writeSnapshotManifest(settings)
  } catch (error) {
    core.warning(`Snapshot manifest not written: ${error}`)
  }
}

// Refuse any tar member outside objects/ or shallow, absolute, or with a `..`
// component — the tar is remote and extracted into .git, so a crafted member could
// escape (e.g. hooks/, ../) and run code during checkout.
export async function assertSafeTarMembers(tar: string): Promise<void> {
  let listing = ''
  await exec.exec('tar', ['-tf', tar], {
    silent: true,
    listeners: {stdout: (d: Buffer) => (listing += d.toString())}
  })
  for (const raw of listing.split('\n')) {
    const member = raw.trim()
    if (!member) {
      continue
    }
    const top = member.replace(/^\.\//, '').split('/')[0]
    if (
      member.startsWith('/') ||
      member.split('/').includes('..') ||
      (top !== 'objects' && top !== 'shallow')
    ) {
      throw new Error(`unexpected snapshot tar member: ${member}`)
    }
  }
}

async function restoreSnapshot(
  settings: IGitSourceSettings,
  url: string,
  sha: string
): Promise<boolean> {
  const gitDir = path.join(settings.repositoryPath, '.git')
  const tmpTar = path.join(os.tmpdir(), `wb-snapshot-${process.pid}.tar`)
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    })
    if (!res.ok || !res.body) {
      throw new Error(`snapshot download answered ${res.status}`)
    }
    await pipeline(
      Readable.fromWeb(res.body as import('stream/web').ReadableStream),
      fs.createWriteStream(tmpTar)
    )
    await assertSafeTarMembers(tmpTar)
    await exec.exec('tar', ['-xf', tmpTar, '-C', gitDir])

    const check = await exec.exec(
      'git',
      ['-C', settings.repositoryPath, 'cat-file', '-e', `${sha}^{commit}`],
      {ignoreReturnCode: true}
    )
    if (check !== 0) {
      throw new Error(`restored snapshot does not contain ${sha}`)
    }

    // The ref the skipped fetch would have created; upstream's verification needs it.
    const dstRef = computeDestinationRef(settings.ref)
    if (dstRef) {
      await exec.exec('git', [
        '-C',
        settings.repositoryPath,
        'update-ref',
        dstRef,
        sha
      ])
    }

    return true
  } catch (error) {
    core.warning(`Snapshot restore failed: ${error}`)
    await resetGitObjects(gitDir)
    return false
  } finally {
    await fs.promises.rm(tmpTar, {force: true})
  }
}

// Reset .git/objects (and drop any restored shallow) to the empty shape `git init`
// creates, so a failed restore leaves no trace for the fallback fetch.
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

// Directory the agent scans post-job for snapshots to upload. Under RUNNER_TEMP, which
// is <runner>/_work/_temp — host-visible to the agent (it knows the runner dir).
export function manifestDir(): string {
  const runnerTemp = process.env['RUNNER_TEMP'] || os.tmpdir()
  return path.join(runnerTemp, 'wb-snapshots')
}

// One manifest per cache miss: the agent tars git_dir/objects and uploads it keyed by sha.
async function writeSnapshotManifest(
  settings: IGitSourceSettings
): Promise<void> {
  const sha = settings.commit
  const manifest = {
    repo_key: process.env['GITHUB_REPOSITORY_ID'] as string,
    sha,
    git_dir: path.join(settings.repositoryPath, '.git')
  }
  const dir = manifestDir()
  await fs.promises.mkdir(dir, {recursive: true})
  await fs.promises.writeFile(
    path.join(dir, `${sha}.json`),
    JSON.stringify(manifest)
  )
  core.info(
    `Cache miss recorded for ${sha}; the WarpBuild agent will upload the snapshot after the job`
  )
}
