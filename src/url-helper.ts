import * as assert from 'assert'
import {URL} from 'url'
import {IGitSourceSettings} from './git-source-settings'

export function getFetchUrl(settings: IGitSourceSettings): string {
  assert.ok(
    settings.repositoryOwner,
    'settings.repositoryOwner must be defined'
  )
  assert.ok(settings.repositoryName, 'settings.repositoryName must be defined')
  const serviceUrl = getServerUrl(settings.githubServerUrl)
  const encodedOwner = encodeURIComponent(settings.repositoryOwner)
  const encodedName = encodeURIComponent(settings.repositoryName)
  if (settings.sshKey) {
    const user = settings.sshUser.length > 0 ? settings.sshUser : 'git'
    return `${user}@${serviceUrl.hostname}:${encodedOwner}/${encodedName}.git`
  }

  // "origin" is SCHEME://HOSTNAME[:PORT]
  return `${serviceUrl.origin}/${encodedOwner}/${encodedName}`
}

export function getServerUrl(url?: string): URL {
  let urlValue =
    url && url.trim().length > 0
      ? url
      : process.env['GITHUB_SERVER_URL'] || 'https://github.com'
  return new URL(urlValue)
}

export function getServerApiUrl(url?: string): string {
  let apiUrl = 'https://api.github.com'

  if (isGhes(url)) {
    const serverUrl = getServerUrl(url)
    apiUrl = new URL(`${serverUrl.origin}/api/v3`).toString()
  }

  return apiUrl
}

export function isGhes(url?: string): boolean {
  const ghUrl = getServerUrl(url)

  return ghUrl.hostname.toUpperCase() !== 'GITHUB.COM'
}
