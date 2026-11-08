import {execFileSync} from 'node:child_process'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {expect, it} from '@jest/globals'
import {createCommandManager} from '../src/git-command-manager.js'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim()
}

it.each([false, true])(
  'recovers full history after a filtered fetch (already unshallowed: %s)',
  async alreadyUnshallowed => {
    const directory = await mkdtemp(join(tmpdir(), 'checkout-partial-'))
    try {
      git(directory, 'init', '-q', '-b', 'main', 'remote')
      git(directory, 'init', '-q', 'local')
      const remote = join(directory, 'remote')
      const local = join(directory, 'local')
      git(remote, 'config', 'uploadpack.allowFilter', 'true')
      git(remote, 'config', 'user.name', 'Checkout Test')
      git(remote, 'config', 'user.email', 'checkout@example.invalid')
      await writeFile(join(remote, 'historical.txt'), 'historical blob\n')
      git(remote, 'add', 'historical.txt')
      git(remote, 'commit', '-qm', 'Add historical blob')
      git(remote, 'rm', '-q', 'historical.txt')
      git(remote, 'commit', '-qm', 'Remove historical blob')

      git(local, 'remote', 'add', 'origin', pathToFileURL(remote).href)
      const refSpec = ['+refs/heads/main:refs/remotes/origin/main']
      const manager = await createCommandManager(local, false, false)
      await manager.fetch(refSpec, {filter: 'blob:none', fetchDepth: 1})
      if (alreadyUnshallowed) {
        await manager.fetch(refSpec, {filter: 'blob:none', fetchDepth: 0})
      }
      await writeFile(join(local, 'keep.txt'), 'worktree file\n')

      await manager.fetch(refSpec, {fetchDepth: 0})

      expect(git(local, 'rev-parse', '--is-shallow-repository')).toBe('false')
      expect(
        git(
          local,
          'rev-list',
          '--objects',
          '--all',
          '--quiet',
          '--missing=print'
        )
      ).toBe('')
      expect(
        await manager.configExists('remote.origin.partialclonefilter')
      ).toBe(false)
      expect(await manager.configExists('remote.origin.promisor')).toBe(false)
      expect(git(local, 'status', '--short')).toBe('?? keep.txt')
    } finally {
      await rm(directory, {recursive: true, force: true})
    }
  },
  20000
)
