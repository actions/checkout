import * as assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as github from '@actions/github'
import * as io from '@actions/io'
import * as path from 'path'
import {ReposGetArchiveLinkParams} from '@octokit/rest'
import {defaultCoreCipherList} from 'constants'
import {ExecOptions} from '@actions/exec/lib/interfaces'

const IS_WINDOWS = process.platform === 'win32'

export async function downloadRepository(
  accessToken: string,
  owner: string,
  repo: string,
  ref: string,
  repositoryPath: string
): Promise<void> {
  const octokit = new github.GitHub(accessToken)
  const params: ReposGetArchiveLinkParams = {
    archive_format: IS_WINDOWS ? 'zipball' : 'tarball',
    owner: owner,
    repo: repo,
    ref: ref
  }
  // todo: retry
  const response = await octokit.repos.getArchiveLink(params)
  if (response.status != 200) {
    throw new Error(
      `Unexpected response from GitHub API. Status: '${response.status}'; Data: '${response.data}'`
    )
  }
  console.log(`status=${response.status}`)
  console.log(`headers=${JSON.stringify(response.headers)}`)
  console.log(`data=${JSON.stringify(typeof response.data)}`)
  console.log(`data.length=${(response.data as Buffer).length}`)
  const runnerTemp = process.env['RUNNER_TEMP'] as string
  assert.ok(runnerTemp, 'RUNNER_TEMP not defined')
  const archiveFile = path.join(runnerTemp, 'checkout.tar.gz')
  await fs.promises.writeFile(archiveFile, response.data as Buffer)
  await exec.exec(`ls -la "${archiveFile}"`, [], {
    cwd: repositoryPath
  } as ExecOptions)
  await exec.exec(`tar -xzf "${archiveFile}"`, [], {
    cwd: repositoryPath
  } as ExecOptions)
}
