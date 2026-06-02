import * as core from '@actions/core'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as lockfile from 'proper-lockfile'
import {IGitCommandManager} from './git-command-manager'

export class GitCacheHelper {
  constructor(private referenceCache: string) {}

  /**
   * Prepares the reference cache for a given repository URL.
   * If the cache does not exist, it performs a bare clone.
   * If it exists, it performs a fetch to update it.
   * Returns the absolute path to the bare cache repository.
   */
  async setupCache(git: IGitCommandManager, repositoryUrl: string): Promise<string> {
    const cacheDirName = this.generateCacheDirName(repositoryUrl)
    const cachePath = path.join(this.referenceCache, cacheDirName)
    
    // Ensure the base cache directory exists before we try to lock inside it
    if (!fs.existsSync(this.referenceCache)) {
      await fs.promises.mkdir(this.referenceCache, { recursive: true })
    }

    // We use a dedicated lock dir specifically for this repository's cache
    // since we cannot place a lock *inside* a repository that might not exist yet
    const lockfilePath = `${cachePath}.lock`
    
    // Ensure the file we are locking exists
    if (!fs.existsSync(lockfilePath)) {
      await fs.promises.writeFile(lockfilePath, '')
    }

    core.debug(`Acquiring lock for ${repositoryUrl} at ${lockfilePath}`)
    
    let releaseLock: () => Promise<void>
    try {
      // proper-lockfile creates a ".lock" directory next to the target file.
      // We configure it to wait up to 10 minutes (600,000 ms) for another process to finish.
      // E.g. cloning a very large monorepo might take minutes.
      releaseLock = await lockfile.lock(lockfilePath, {
        retries: {
          retries: 60,         // try 60 times
          factor: 1,           // linear backoff
          minTimeout: 10000,   // wait 10 seconds between tries
          maxTimeout: 10000,   // (total max wait time: 600s = 10m)
          randomize: true
        }
      })
      core.debug(`Lock acquired.`)
    } catch (err) {
      throw new Error(`Failed to acquire lock for repository cache ${repositoryUrl}: ${err}`)
    }

    try {
      if (fs.existsSync(path.join(cachePath, 'objects'))) {
        core.info(`Reference cache for ${repositoryUrl} exists. Updating...`)
        const args = ['-C', cachePath, 'fetch', '--force', '--prune', '--tags', 'origin', '+refs/heads/*:refs/heads/*']
        await git.execGit(args)
      } else {
        core.info(`Reference cache for ${repositoryUrl} does not exist. Cloning --bare...`)
        
        // Use a temporary clone pattern to prevent corrupted repos if process is killed mid-clone
        const tmpPath = `${cachePath}.tmp.${crypto.randomUUID()}`
        try {
          const args = ['-C', this.referenceCache, 'clone', '--bare', repositoryUrl, tmpPath]
          await git.execGit(args)
          
          if (fs.existsSync(cachePath)) {
            // In rare cases where it somehow exists but objects/ didn't, clean it up
            await fs.promises.rm(cachePath, { recursive: true, force: true })
          }
          await fs.promises.rename(tmpPath, cachePath)
        } catch (cloneErr) {
          // Cleanup partial clone if an error occurred
          await fs.promises.rm(tmpPath, { recursive: true, force: true }).catch(() => {})
          throw cloneErr
        }
      }
    } finally {
      await releaseLock()
    }

    return cachePath
  }

  /**
   * Generates a directory name for the cache based on the URL.
   * Replaces non-alphanumeric characters with underscores
   * and appends a short SHA256 hash of the original URL.
   */
  generateCacheDirName(url: string): string {
    const cleanUrl = url.replace(/[^a-zA-Z0-9]/g, '_')
    const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 8)
    return `${cleanUrl}_${hash}.git`
  }
}
