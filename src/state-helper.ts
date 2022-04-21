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
 * The set-safe-directory for the POST action. The value is set if input: 'safe-directory' is set during the MAIN action.
 */
export const PostSetSafeDirectory =
  (process.env['STATE_setSafeDirectory'] as string) === 'true'

/**
 * The SSH key path for the POST action. The value is empty during the MAIN action.
 */
export const SshKeyPath = (process.env['STATE_sshKeyPath'] as string) || ''

/**
 * The SSH known hosts path for the POST action. The value is empty during the MAIN action.
 */
export const SshKnownHostsPath =
  (process.env['STATE_sshKnownHostsPath'] as string) || ''

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

/**
 * Save the SSH key path so the POST action can retrieve the value.
 */
export function setSshKeyPath(sshKeyPath: string) {
  coreCommand.issueCommand('save-state', {name: 'sshKeyPath'}, sshKeyPath)
}

/**
 * Save the SSH known hosts path so the POST action can retrieve the value.
 */
export function setSshKnownHostsPath(sshKnownHostsPath: string) {
  coreCommand.issueCommand(
    'save-state',
    {name: 'sshKnownHostsPath'},
    sshKnownHostsPath
  )
}

/**
 * Save the sef-safe-directory input so the POST action can retrieve the value.
 */
export function setSafeDirectory() {
  coreCommand.issueCommand('save-state', {name: 'setSafeDirectory'}, 'true')
}

// Publish a variable so that when the POST action runs, it can determine it should run the cleanup logic.
// This is necessary since we don't have a separate entry point.
if (!IsPost) {
  coreCommand.issueCommand('save-state', {name: 'isPost'}, 'true')
}
