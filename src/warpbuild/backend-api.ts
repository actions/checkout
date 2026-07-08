/* eslint-disable i18n-text/no-en -- upstream convention */
import * as core from '@actions/core'

// Client for backend-core's /api/v1/git-mirrors endpoints, authed by the runner
// verification token. Contract: 200 = presigned URL; 404 = miss (upload after the
// stock fetch); 403 = unservable org (skip cache + upload); else = fall back.

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

export type UploadURLResult =
  | {kind: 'ok'; url: string}
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

export async function requestUploadURL(
  repoKey: string,
  sha: string
): Promise<UploadURLResult> {
  try {
    const res = await fetch(`${baseUrl()}/api/v1/git-mirrors/upload-url`, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json'
      },
      body: JSON.stringify({repo_key: repoKey, sha}),
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    })
    if (res.status === 200) {
      const body = (await res.json()) as {url?: string}
      if (body.url) {
        return {kind: 'ok', url: body.url}
      }
      return {kind: 'error'}
    }
    if (res.status === 403) {
      core.debug(`[wb-cache] upload-url answered 403 (disabled)`)
      return {kind: 'disabled'}
    }
    core.debug(`[wb-cache] upload-url answered ${res.status}`)
    return {kind: 'error'}
  } catch (error) {
    core.debug(`[wb-cache] upload-url failed: ${error}`)
    return {kind: 'error'}
  }
}
