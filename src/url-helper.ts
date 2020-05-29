import * as assert from 'assert'
import {IGitSourceSettings} from './git-source-settings'
import {URL} from 'url'

export function getFetchUrl(settings: IGitSourceSettings): string {
  assert.ok(
    settings.repositoryOwner,
    'settings.repositoryOwner must be defined'
  )
  assert.ok(settings.repositoryName, 'settings.repositoryName must be defined')
  const serviceUrl = getServerUrl(settings.isGist)
  const encodedOwner = encodeURIComponent(settings.repositoryOwner)
  const encodedName = encodeURIComponent(settings.repositoryName)
  let encodedNwo = `${encodedOwner}/${encodedName}`
  if (settings.isGist) {
    encodedNwo = encodedName
  }
  if (settings.sshKey) {
    return `git@${serviceUrl.hostname}:${encodedNwo}.git`
  }

  // "origin" is SCHEME://HOSTNAME[:PORT]
  return `${serviceUrl.origin}/${encodedNwo}`
}

export function getServerUrl(isGist: boolean): URL {
  // todo: remove GITHUB_URL after support for GHES Alpha is no longer needed
  let serverUrl = new URL(
    process.env['GITHUB_SERVER_URL'] ||
      process.env['GITHUB_URL'] ||
      'https://github.com'
  )

  // todo: don't assume subdomain isolation
  if (isGist) {
    serverUrl.hostname = `gist.${serverUrl.hostname}`
  }

  return serverUrl
}
