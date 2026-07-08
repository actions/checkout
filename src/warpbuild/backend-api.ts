/* eslint-disable i18n-text/no-en -- log/error strings are English by upstream convention */
import * as core from '@actions/core'

// Thin client for backend-core's /api/v1/git-mirrors endpoints.
//
// Auth is the runner verification token every WarpBuild job carries in its env
// (WARPBUILD_RUNNER_VERIFICATION_TOKEN); the backend resolves instance → org from the
// token alone.
//
// HTTP contract (mirrors internal/runners/internal/git_mirror_service.go):
//   200 -> use the presigned URL
//   404 -> cache miss: create the mirror (download from GitHub + tar + upload)
//   403 -> feature disabled for this org (backend-driven kill switch): skip mirror
//          creation and upload entirely, behave exactly like stock actions/checkout
//   else -> transient trouble: fall back WITHOUT the mirror download

const API_TIMEOUT_MS = 10_000

export interface MirrorDownloadInfo {
  url: string
  size_bytes: number
  created_at: string
}

export type MirrorLookup =
  | {kind: 'hit'; info: MirrorDownloadInfo}
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

export async function lookupMirror(repoKey: string): Promise<MirrorLookup> {
  try {
    const res = await fetch(
      `${baseUrl()}/api/v1/git-mirrors/download-url?repo_key=${encodeURIComponent(repoKey)}`,
      {
        headers: {authorization: authHeader()},
        signal: AbortSignal.timeout(API_TIMEOUT_MS)
      }
    )
    if (res.status === 200) {
      return {kind: 'hit', info: (await res.json()) as MirrorDownloadInfo}
    }
    if (res.status === 404) {
      return {kind: 'miss'}
    }
    if (res.status === 403) {
      core.debug(`[wb-mirror] download-url answered 403 (disabled)`)
      return {kind: 'disabled'}
    }
    core.debug(`[wb-mirror] download-url answered ${res.status}`)
    return {kind: 'error'}
  } catch (error) {
    core.debug(`[wb-mirror] download-url failed: ${error}`)
    return {kind: 'error'}
  }
}

export async function requestUploadURL(
  repoKey: string
): Promise<UploadURLResult> {
  try {
    const res = await fetch(`${baseUrl()}/api/v1/git-mirrors/upload-url`, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json'
      },
      body: JSON.stringify({repo_key: repoKey}),
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
      core.debug(`[wb-mirror] upload-url answered 403 (disabled)`)
      return {kind: 'disabled'}
    }
    core.debug(`[wb-mirror] upload-url answered ${res.status}`)
    return {kind: 'error'}
  } catch (error) {
    core.debug(`[wb-mirror] upload-url failed: ${error}`)
    return {kind: 'error'}
  }
}
