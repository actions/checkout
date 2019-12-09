import * as github from '@actions/github'
import {ReposGetArchiveLinkParams} from '@octokit/rest'

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
    archive_format: IS_WINDOWS ? 'zipball' : 'tarballl',
    owner: owner,
    repo: repo,
    ref: ref
  }
  const response = await octokit.repos.getArchiveLink(params)
  if (response.status != 200) {
    throw new Error(
      `GitHub API call failed with response status '${response.status}': ${response.data}`
    )
  }
  console.log(`status=${response.status}`)
  console.log(`headers=${JSON.stringify(response.headers)}`)
  console.log(`data=${JSON.stringify(typeof response.data)}`)
}
