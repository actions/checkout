import * as fs from 'fs'

function isErrorObject(
  error: unknown
): error is {code?: string; message?: string} {
  return typeof error === 'object' && error !== null
}

export function directoryExistsSync(path: string, required?: boolean): boolean {
  if (!path) {
    throw new Error("Arg 'path' must not be empty")
  }

  let stats: fs.Stats
  try {
    stats = fs.statSync(path)
  } catch (error) {
    if (isErrorObject(error)) {
      if (error.code === 'ENOENT') {
        if (!required) {
          return false
        }

        throw new Error(`Directory '${path}' does not exist`)
      }

      if (error.message) {
        throw new Error(
          `Encountered an error when checking whether path '${path}' exists: ${error.message}`
        )
      }
    }

    throw new Error(
      `Encountered an error when checking whether path '${path}' exists: ${error}`
    )
  }

  if (stats.isDirectory()) {
    return true
  } else if (!required) {
    return false
  }

  throw new Error(`Directory '${path}' does not exist`)
}

export function existsSync(path: string): boolean {
  if (!path) {
    throw new Error("Arg 'path' must not be empty")
  }

  try {
    fs.statSync(path)
  } catch (error) {
    if (isErrorObject(error)) {
      if (error.code === 'ENOENT') {
        return false
      }

      if (error.message) {
        throw new Error(
          `Encountered an error when checking whether path '${path}' exists: ${error.message}`
        )
      }
    }

    throw new Error(
      `Encountered an error when checking whether path '${path}' exists: ${error}`
    )
  }

  return true
}

export function fileExistsSync(path: string): boolean {
  if (!path) {
    throw new Error("Arg 'path' must not be empty")
  }

  let stats: fs.Stats
  try {
    stats = fs.statSync(path)
  } catch (error) {
    if (isErrorObject(error)) {
      if (error.code === 'ENOENT') {
        return false
      }

      if (error.message) {
        throw new Error(
          `Encountered an error when checking whether path '${path}' exists: ${error.message}`
        )
      }
    }

    throw new Error(
      `Encountered an error when checking whether path '${path}' exists: ${error}`
    )
  }

  if (!stats.isDirectory()) {
    return true
  }

  return false
}
