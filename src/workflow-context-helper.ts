import * as core from '@actions/core'
import * as fs from 'fs'

/**
 * Gets the organization ID of the running workflow or undefined if the value cannot be loaded from the GITHUB_EVENT_PATH
 */
export async function getOrganizationId(): Promise<number | undefined> {
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH
    if (!eventPath) {
      core.debug(`GITHUB_EVENT_PATH is not defined`)
      return
    }

    const content = await fs.promises.readFile(eventPath, {encoding: 'utf8'})
    const event = JSON.parse(content)
    const id = event?.repository?.owner?.id
    if (typeof id !== 'number') {
      core.debug('Repository owner ID not found within GITHUB event info')
      return
    }

    return id as number
  } catch (err) {
    core.debug(
      `Unable to load organization ID from GITHUB_EVENT_PATH: ${
        (err as any).message || err
      }`
    )
  }
}
