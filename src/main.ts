import * as core from '@actions/core'
import * as coreCommand from '@actions/core/lib/command'
import * as gitSourceProvider from './git-source-provider'
import * as inputHelper from './input-helper'
import * as path from 'path'

const cleanupRepositoryPath = process.env['STATE_repositoryPath'] as string

async function run(): Promise<void> {
  try {
    const sourceSettings = inputHelper.getInputs()

    try {
      // Register problem matcher
      coreCommand.issueCommand(
        'add-matcher',
        {},
        path.join(__dirname, 'problem-matcher.json')
      )

      // Get sources
      await gitSourceProvider.getSource(sourceSettings)
    } finally {
      // Unregister problem matcher
      coreCommand.issueCommand('remove-matcher', {owner: 'checkout-git'}, '')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function cleanup(): Promise<void> {
  try {
    await gitSourceProvider.cleanup(cleanupRepositoryPath)
  } catch (error) {
    core.warning(error.message)
  }
}

// Main
if (!cleanupRepositoryPath) {
  run()
}
// Post
else {
  cleanup()
}
