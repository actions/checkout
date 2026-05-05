import * as path from 'path'
import * as fs from 'fs'
import * as io from '@actions/io'
import { GitCacheHelper } from '../src/git-cache-helper'
import { IGitCommandManager } from '../src/git-command-manager'

describe('GitCacheHelper', () => {
  let cacheHelper: GitCacheHelper
  let mockGit: jest.Mocked<IGitCommandManager>

  const cacheDir = path.join(__dirname, 'test-cache')

  beforeEach(async () => {
    cacheHelper = new GitCacheHelper(cacheDir)
    mockGit = {
      execGit: jest.fn().mockImplementation(async (args) => {
        // If git clone is called, simulate creating the destination dir
        if (args && args.includes('clone')) {
          const dest = args.find((a: string) => a.includes('.tmp.'));
          if (dest) {
            await io.mkdirP(dest);
          } else {
            console.log('No .tmp. found in args:', args);
          }
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      }),
      gitEnv: {}
    } as any

    await io.mkdirP(cacheDir)
  })

  afterEach(async () => {
    await io.rmRF(cacheDir)
  })

  it('generates a consistent, short, and safe cache directory name', () => {
    const url1 = 'https://github.com/mwyraz/forgejo-actions-checkout.git'
    const name1 = (cacheHelper as any).generateCacheDirName(url1)
    
    // Check structure: safe string + hash
    expect(name1).toMatch(/^https___github_com_mwyraz_forgejo_actions_checkout_git_[0-9a-f]{8}\.git$/)

    // Same URL should produce the same directory name
    const url1_duplicate = 'https://github.com/mwyraz/forgejo-actions-checkout.git'
    expect((cacheHelper as any).generateCacheDirName(url1_duplicate)).toBe(name1)

    // Different URL should produce a different directory name
    const url2 = 'https://github.com/mwyraz/forgejo-actions-checkout-other.git'
    expect((cacheHelper as any).generateCacheDirName(url2)).not.toBe(name1)

    // SSH URL
    const url3 = 'git@github.com:auth/repo.git'
    const name3 = (cacheHelper as any).generateCacheDirName(url3)
    expect(name3).toMatch(/^git_github_com_auth_repo_git_[0-9a-f]{8}\.git$/)
    
    // Unclean URLs
    const url4 = 'https://github.com/foo/bar.git?v=1'
    const name4 = (cacheHelper as any).generateCacheDirName(url4)
    expect(name4).toMatch(/^https___github_com_foo_bar_git_v_1_[0-9a-f]{8}\.git$/)
  })

  it('sets up a cache directory if it does not exist', async () => {
    const repositoryUrl = 'https://github.com/mwyraz/test-repo.git'
    const resultPath = await cacheHelper.setupCache(mockGit, repositoryUrl)

    const expectedName = (cacheHelper as any).generateCacheDirName(repositoryUrl)
    expect(resultPath).toBe(path.join(cacheDir, expectedName))

    // It should have executed git clone --bare
    expect(mockGit.execGit).toHaveBeenCalledWith(
      expect.arrayContaining([
        '-C',
        cacheDir,
        'clone',
        '--bare',
        repositoryUrl,
        expect.stringContaining(`${expectedName}.tmp`) // should use tmp dir
      ])
    )
  })

  it('fetches updates if the cache directory already exists', async () => {
    const repositoryUrl = 'https://github.com/mwyraz/existing-repo.git'
    const expectedName = (cacheHelper as any).generateCacheDirName(repositoryUrl)
    const fixedPath = path.join(cacheDir, expectedName)

    // Fake existing directory
    await io.mkdirP(path.join(fixedPath, 'objects'))

    const resultPath = await cacheHelper.setupCache(mockGit, repositoryUrl)
    expect(resultPath).toBe(fixedPath)

    // It should have executed git fetch
    expect(mockGit.execGit).toHaveBeenCalledWith(
      expect.arrayContaining([
        '-C',
        fixedPath,
        'fetch',
        '--force',
        '--prune',
        '--tags',
        'origin',
        '+refs/heads/*:refs/heads/*'
      ])
    )
  })
})
