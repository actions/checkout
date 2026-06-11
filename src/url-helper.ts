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
  let resolvedUrl = process.env['GITHUB_SERVER_URL'] || 'https://github.com'
  if (hasContent(url, WhitespaceMode.Trim)) {
    resolvedUrl = url!
  }

  return new URL(resolvedUrl)
}

export function getServerApiUrl(url?: string): string {
  if (hasContent(url, WhitespaceMode.Trim)) {
    let serverUrl = getServerUrl(url)
    if (isGhes(url)) {
      serverUrl.pathname = 'api/v3'
    } else {
      serverUrl.hostname = 'api.' + serverUrl.hostname
    }

    return pruneSuffix(serverUrl.toString(), '/')
  }

  return process.env['GITHUB_API_URL'] || 'https://api.github.com'
}

export function isGhes(url?: string): boolean {
  const ghUrl = new URL(
    url || process.env['GITHUB_SERVER_URL'] || 'https://github.com'
  )

  const hostname = ghUrl.hostname.trimEnd().toUpperCase()
  const isGitHubHost = hostname === 'GITHUB.COM'
  const isGitHubEnterpriseCloudHost = hostname.endsWith('.GHE.COM')
  const isLocalHost = hostname.endsWith('.LOCALHOST')

  return !isGitHubHost && !isGitHubEnterpriseCloudHost && !isLocalHost
}

function pruneSuffix(text: string, suffix: string) {
  if (hasContent(suffix, WhitespaceMode.Preserve) && text?.endsWith(suffix)) {
    return text.substring(0, text.length - suffix.length)
  }
  return text
}

enum WhitespaceMode {
  Trim,
  Preserve
}

function hasContent(
  text: string | undefined,
  whitespaceMode: WhitespaceMode
): boolean {
  let refinedText = text ?? ''
  if (whitespaceMode == WhitespaceMode.Trim) {
    refinedText = refinedText.trim()
  }
  return refinedText.length > 0
}
