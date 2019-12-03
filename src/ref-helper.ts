import {IGitCommandManager} from './git-command-manager'

export interface ICheckoutInfo {
  ref: string
  startPoint: string
}

export async function getCheckoutInfo(
  git: IGitCommandManager,
  ref: string,
  commit: string
): Promise<ICheckoutInfo> {
  if (!git) {
    throw new Error('Arg git cannot be empty')
  }

  if (!ref && !commit) {
    throw new Error('Args ref and commit cannot both be empty')
  }

  const result = ({} as unknown) as ICheckoutInfo
  const upperRef = (ref || '').toUpperCase()

  // SHA only
  if (!ref) {
    result.ref = commit
  }
  // refs/heads/
  else if (upperRef.startsWith('REFS/HEADS/')) {
    const branch = ref.substring('refs/heads/'.length)
    result.ref = branch
    result.startPoint = `refs/remotes/origin/${branch}`
  }
  // refs/pull/
  else if (upperRef.startsWith('REFS/PULL/')) {
    const branch = ref.substring('refs/pull/'.length)
    result.ref = `refs/remotes/pull/${branch}`
  }
  // refs/tags/
  else if (upperRef.startsWith('REFS/')) {
    result.ref = ref
  }
  // Unqualified ref, check for a matching branch or tag
  else {
    if (await git.branchExists(true, `origin/${ref}`)) {
      result.ref = ref
      result.startPoint = `refs/remotes/origin/${ref}`
    } else if (await git.tagExists(`${ref}`)) {
      result.ref = `refs/tags/${ref}`
    } else {
      throw new Error(
        `A branch or tag with the name '${ref}' could not be found`
      )
    }
  }

  return result
}

export function getRefSpec(ref: string, commit: string): string[] {
  if (!ref && !commit) {
    throw new Error('Args ref and commit cannot both be empty')
  }

  const upperRef = (ref || '').toUpperCase()

  // SHA
  if (commit) {
    // refs/heads
    if (upperRef.startsWith('REFS/HEADS/')) {
      const branch = ref.substring('refs/heads/'.length)
      return [`+${commit}:refs/remotes/origin/${branch}`]
    }
    // refs/pull/
    else if (upperRef.startsWith('REFS/PULL/')) {
      const branch = ref.substring('refs/pull/'.length)
      return [`+${commit}:refs/remotes/pull/${branch}`]
    }
    // refs/tags/
    else if (upperRef.startsWith('REFS/TAGS/')) {
      return [`+${commit}:${ref}`]
    }
    // Otherwise no destination ref
    else {
      return [commit]
    }
  }
  // Unqualified ref, check for a matching branch or tag
  else if (!upperRef.startsWith('REFS/')) {
    return [
      `+refs/heads/${ref}*:refs/remotes/origin/${ref}*`,
      `+refs/tags/${ref}*:refs/tags/${ref}*`
    ]
  }
  // refs/heads/
  else if (upperRef.startsWith('REFS/HEADS/')) {
    const branch = ref.substring('refs/heads/'.length)
    return [`+${ref}:refs/remotes/origin/${branch}`]
  }
  // refs/pull/
  else if (upperRef.startsWith('REFS/PULL/')) {
    const branch = ref.substring('refs/pull/'.length)
    return [`+${ref}:refs/remotes/pull/${branch}`]
  }
  // refs/tags/
  else {
    return [`+${ref}:${ref}`]
  }
}
