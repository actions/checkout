/* eslint-disable i18n-text/no-en -- upstream convention */
import * as core from '@actions/core'

// Client for backend-core's git-mirror download-url endpoint, authed by the runner
// verification token. Contract: 200 = presigned URL (hit); 404 = miss; 403 = unservable
// org; else = fall back. The upload half runs in the warpbuild-agent after the job.

const API_TIMEOUT_MS = 10_000

export interface SnapshotDownloadInfo {
  url: string
  size_bytes: number
  created_at: string
}

export type SnapshotLookup =
  | {kind: 'hit'; info: SnapshotDownloadInfo}
  | {kind: 'miss'}
  | {kind: 'disabled'}
  | {kind: 'error'}

function baseUrl(): string {
  return (process.env['WARPBUILD_HOST_URL'] || '').replace(/\/+$/, '')
}

function authHeader(): string {
  return `Bearer ${process.env['WARPBUILD_RUNNER_VERIFICATION_TOKEN'] || ''}`
}

export async function lookupSnapshot(
  repoKey: string,
  sha: string
): Promise<SnapshotLookup> {
  try {
    const res = await fetch(
      `${baseUrl()}/api/v1/git-mirrors/download-url?repo_key=${encodeURIComponent(
        repoKey
      )}&sha=${encodeURIComponent(sha)}`,
      {
        headers: {authorization: authHeader()},
        signal: AbortSignal.timeout(API_TIMEOUT_MS)
      }
    )
    if (res.status === 200) {
      return {kind: 'hit', info: (await res.json()) as SnapshotDownloadInfo}
    }
    if (res.status === 404) {
      return {kind: 'miss'}
    }
    if (res.status === 403) {
      core.debug(`[wb-cache] download-url answered 403 (disabled)`)
      return {kind: 'disabled'}
    }
    core.debug(`[wb-cache] download-url answered ${res.status}`)
    return {kind: 'error'}
  } catch (error) {
    core.debug(`[wb-cache] download-url failed: ${error}`)
    return {kind: 'error'}
  }
}
