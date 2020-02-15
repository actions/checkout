import * as coreCommand from '@actions/core/lib/command'

/**
 * Indicates whether the POST action is running
 */
export const IsPost = !!process.env['STATE_isPost']

/**
 * The repository path for the POST action. The value is empty during the MAIN action.
 */
export const RepositoryPath =
  (process.env['STATE_repositoryPath'] as string) || ''

/**
 * Save the repository path so the POST action can retrieve the value.
 */
export function setRepositoryPath(repositoryPath: string) {
  coreCommand.issueCommand(
    'save-state',
    {name: 'repositoryPath'},
    repositoryPath
  )
}

// Publish a variable so that when the POST action runs, it can determine it should run the cleanup logic.
// This is necessary since we don't have a separate entry point.
if (!IsPost) {
  coreCommand.issueCommand('save-state', {name: 'isPost'}, 'true')
}
