import * as assert from 'assert'
import {IGitSourceSettings} from './git-source-settings'
import {URL} from 'url'
import { settings } from 'cluster'

export function getFetchUrl(settings: IGitSourceSettings): string {
  assert.ok(
    settings.repositoryOwner,
    'settings.repositoryOwner must be defined'
  )
  assert.ok(settings.repositoryName, 'settings.repositoryName must be defined')
  const serviceUrl = getServerUrl(settings.setHost)
  const encodedOwner = encodeURIComponent(settings.repositoryOwner)
  const encodedName = encodeURIComponent(settings.repositoryName)
  if (settings.sshKey) {
    return `git@${serviceUrl.hostname}:${encodedOwner}/${encodedName}.git`
  }

  // "origin" is SCHEME://HOSTNAME[:PORT]
  return `${serviceUrl.origin}/${encodedOwner}/${encodedName}`
}

export function getServerUrl(configHost: string|undefined = undefined): URL {
  if (configHost) {
    return new URL(configHost)
  }
  // todo: remove GITHUB_URL after support for GHES Alpha is no longer needed
  return new URL(
    process.env['GITHUB_SERVER_URL'] ||
      process.env['GITHUB_URL'] ||
      'https://github.com'
  )
}
