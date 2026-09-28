import * as assert from 'assert'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as github from '@actions/github'
import * as io from '@actions/io'
import * as path from 'path'
import * as retryHelper from './retry-helper.js'
import * as toolCache from '@actions/tool-cache'
import {randomUUID} from 'crypto'
import {getServerApiUrl} from './url-helper.js'

const IS_WINDOWS = process.platform === 'win32'

export interface RepositoryObjectFormatResult {
  format: string
  succeeded: boolean
}

export async function downloadRepository(
  authToken: string,
  owner: string,
  repo: string,
  ref: string,
  commit: string,
  repositoryPath: string,
  baseUrl?: string
): Promise<string> {
  // Determine the default branch
  if (!ref && !commit) {
    core.info('Determining the default branch')
    ref = await getDefaultBranch(authToken, owner, repo, baseUrl)
  }

  // Without a commit, resolve the ref to one and download that commit, so the
  // content and the returned SHA agree even if the ref moves in the meantime.
  if (!commit) {
    commit = await tryGetCommitSha(authToken, owner, repo, ref, baseUrl)
  }

  // Download the archive
  let archiveData = await retryHelper.execute(async () => {
    core.info('Downloading the archive')
    return await downloadArchive(authToken, owner, repo, ref, commit, baseUrl)
  })

  // Write archive to disk
  core.info('Writing archive to disk')
  const uniqueId = randomUUID()
  const archivePath = IS_WINDOWS
    ? path.join(repositoryPath, `${uniqueId}.zip`)
    : path.join(repositoryPath, `${uniqueId}.tar.gz`)
  await fs.promises.writeFile(archivePath, archiveData)
  archiveData = Buffer.from('') // Free memory

  // Extract archive
  core.info('Extracting the archive')
  const extractPath = path.join(repositoryPath, uniqueId)
  await io.mkdirP(extractPath)
  if (IS_WINDOWS) {
    await toolCache.extractZip(archivePath, extractPath)
  } else {
    await toolCache.extractTar(archivePath, extractPath)
  }
  await io.rmRF(archivePath)

  // Determine the path of the repository content. The archive contains
  // a top-level folder and the repository content is inside.
  const archiveFileNames = await fs.promises.readdir(extractPath)
  assert.ok(
    archiveFileNames.length == 1,
    'Expected exactly one directory inside archive'
  )
  const archiveVersion = archiveFileNames[0] // The top-level folder name includes the short SHA
  core.info(`Resolved version ${archiveVersion}`)
  const tempRepositoryPath = path.join(extractPath, archiveVersion)

  // Move the files
  for (const fileName of await fs.promises.readdir(tempRepositoryPath)) {
    const sourcePath = path.join(tempRepositoryPath, fileName)
    const targetPath = path.join(repositoryPath, fileName)
    if (IS_WINDOWS) {
      await io.cp(sourcePath, targetPath, {recursive: true}) // Copy on Windows (Windows Defender may have a lock)
    } else {
      await io.mv(sourcePath, targetPath)
    }
  }
  await io.rmRF(extractPath)

  return commit
}

/**
 * Resolves a ref to the SHA of the commit it points at. Returns an empty string
 * when the ref cannot be resolved, so the download falls back to the ref itself.
 */
export async function tryGetCommitSha(
  authToken: string,
  owner: string,
  repo: string,
  ref: string,
  baseUrl?: string
): Promise<string> {
  try {
    return await retryHelper.execute(async () => {
      core.info(`Resolving the commit for '${ref}'`)
      const octokit = github.getOctokit(authToken, {
        baseUrl: getServerApiUrl(baseUrl)
      })
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/commits/{ref}',
        {owner, repo, ref, headers: {accept: 'application/vnd.github.sha'}}
      )
      const sha = String(response.data).trim()
      assert.ok(
        /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(sha),
        `Unexpected commit SHA '${sha}'`
      )
      core.info(`Resolved '${ref}' to ${sha}`)
      return sha
    })
  } catch (err) {
    core.warning(
      `Unable to resolve the commit for '${ref}': ${(err as any)?.message ?? err}`
    )
    return ''
  }
}

/**
 * Looks up the default branch name
 */
export async function getDefaultBranch(
  authToken: string,
  owner: string,
  repo: string,
  baseUrl?: string
): Promise<string> {
  return await retryHelper.execute(async () => {
    core.info('Retrieving the default branch name')
    const octokit = github.getOctokit(authToken, {
      baseUrl: getServerApiUrl(baseUrl)
    })
    let result: string
    try {
      // Get the default branch from the repo info
      const response = await octokit.rest.repos.get({owner, repo})
      result = response.data.default_branch
      assert.ok(result, 'default_branch cannot be empty')
    } catch (err) {
      // Handle .wiki repo
      if (
        (err as any)?.status === 404 &&
        repo.toUpperCase().endsWith('.WIKI')
      ) {
        result = 'master'
      }
      // Otherwise error
      else {
        throw err
      }
    }

    // Print the default branch
    core.info(`Default branch '${result}'`)

    // Prefix with 'refs/heads'
    if (!result.startsWith('refs/')) {
      result = `refs/heads/${result}`
    }

    return result
  })
}

export async function tryGetRepositoryObjectFormat(
  authToken: string,
  owner: string,
  repo: string,
  baseUrl?: string,
  commit?: string
): Promise<RepositoryObjectFormatResult> {
  const commitFormat = getObjectFormat(commit)
  if (commitFormat) {
    return {format: commitFormat, succeeded: true}
  }

  try {
    const octokit = github.getOctokit(authToken, {
      baseUrl: getServerApiUrl(baseUrl)
    })
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/hash-algorithm',
      {owner, repo}
    )
    const hashAlgorithm = response.data.hash_algorithm
    if (hashAlgorithm === 'sha256' || hashAlgorithm === 'sha1') {
      return {format: hashAlgorithm, succeeded: true}
    }

    core.debug(
      'Unable to determine repository object format from hash-algorithm endpoint'
    )
    return {format: '', succeeded: false}
  } catch (err) {
    core.debug(
      `Unable to determine repository object format from hash-algorithm endpoint: ${(err as any)?.message ?? err}`
    )
    return {format: '', succeeded: false}
  }
}

function getObjectFormat(sha?: string): string {
  if (/^[0-9a-fA-F]{64}$/.test(sha || '')) {
    return 'sha256'
  }
  if (/^[0-9a-fA-F]{40}$/.test(sha || '')) {
    return 'sha1'
  }
  return ''
}

async function downloadArchive(
  authToken: string,
  owner: string,
  repo: string,
  ref: string,
  commit: string,
  baseUrl?: string
): Promise<Buffer> {
  const octokit = github.getOctokit(authToken, {
    baseUrl: getServerApiUrl(baseUrl)
  })
  const download = IS_WINDOWS
    ? octokit.rest.repos.downloadZipballArchive
    : octokit.rest.repos.downloadTarballArchive
  const response = await download({
    owner: owner,
    repo: repo,
    ref: commit || ref
  })
  return Buffer.from(response.data as ArrayBuffer) // response.data is ArrayBuffer
}
