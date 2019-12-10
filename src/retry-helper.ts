import * as core from '@actions/core'

const maxAttempts = 3
const minSeconds = 10
const maxSeconds = 20

export async function execute<T>(action: () => Promise<T>): Promise<T> {
  let attempt = 1
  while (attempt < maxAttempts) {
    // Try
    try {
      return await action()
    } catch (err) {
      core.info(err.message)
    }

    // Sleep
    const seconds = getRandomIntInclusive(minSeconds, maxSeconds)
    core.info(`Waiting ${seconds} before trying again`)
    await sleep(seconds * 1000)
    attempt++
  }

  // Last attempt
  return await action()
}

function getRandomIntInclusive(minimum: number, maximum: number): number {
  minimum = Math.floor(minimum)
  maximum = Math.floor(maximum)
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum
}

async function sleep(milliseconds): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
