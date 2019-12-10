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
  // console.log(`data=${response.data}`)
  // console.log(`data=${JSON.stringify(response.data)}`)
  // for (const key of Object.keys(response.data)) {
  //   console.log(`data['${key}']=${response.data[key]}`)
  // }
  const runnerTemp = process.env['RUNNER_TEMP'] as string
  assert.ok(runnerTemp, 'RUNNER_TEMP not defined')
  const archiveFile = path.join(runnerTemp, 'checkout-archive.tar.gz')
  await io.rmRF(archiveFile)
  await fs.promises.writeFile(archiveFile, new Buffer(response.data))
  await exec.exec(`ls -la "${archiveFile}"`, [], {
    cwd: repositoryPath
  } as ExecOptions)

  const extractPath = path.join(runnerTemp, 'checkout-archive')
  await io.rmRF(extractPath)
  await io.mkdirP(extractPath)
  await exec.exec(`tar -xzf "${archiveFile}"`, [], {
    cwd: extractPath
  } as ExecOptions)

  // Determine the real directory to copy (ignore extra dir at root of the archive)
  const archiveFileNames = await fs.promises.readdir(extractPath)
  assert.ok(
    archiveFileNames.length == 1,
    'Expected exactly one directory inside archive'
  )
  const extraDirectoryName = archiveFileNames[0]
  core.info(`Resolved ${extraDirectoryName}`) // contains the short SHA
  const tempRepositoryPath = path.join(extractPath, extraDirectoryName)

  for (const fileName of tempRepositoryPath) {
    const sourcePath = path.join(tempRepositoryPath, fileName)
    const targetPath = path.join(repositoryPath, fileName)
    await io.mv(sourcePath, targetPath)
  }

  await exec.exec(`find .`, [], {
    cwd: repositoryPath
  } as ExecOptions)
}
