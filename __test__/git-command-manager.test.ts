import * as exec from '@actions/exec'
import * as fshelper from '../lib/fs-helper'
import * as commandManager from '../lib/git-command-manager'

let git: commandManager.IGitCommandManager
let mockExec = jest.fn()

describe('git-auth-helper tests', () => {
  beforeAll(async () => {})

  beforeEach(async () => {
    jest.spyOn(fshelper, 'fileExistsSync').mockImplementation(jest.fn())
    jest.spyOn(fshelper, 'directoryExistsSync').mockImplementation(jest.fn())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {})

  it('branch list matches', async () => {
    mockExec.mockImplementation((path, args, options) => {
      console.log(args, options.listeners.stdout)

      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
        return 0
      }

      if (args.includes('rev-parse')) {
        options.listeners.stdline(Buffer.from('refs/heads/foo'))
        options.listeners.stdline(Buffer.from('refs/heads/bar'))
        return 0
      }

      return 1
    })
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)
    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )

    let branches = await git.branchList(false)

    expect(branches).toHaveLength(2)
    expect(branches.sort()).toEqual(['foo', 'bar'].sort())
  })

  it('ambiguous ref name output is captured', async () => {
    mockExec.mockImplementation((path, args, options) => {
      console.log(args, options.listeners.stdout)

      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
        return 0
      }

      if (args.includes('rev-parse')) {
        options.listeners.stdline(Buffer.from('refs/heads/foo'))
        // If refs/tags/v1 and refs/heads/tags/v1 existed on this repository
        options.listeners.errline(
          Buffer.from("error: refname 'tags/v1' is ambiguous")
        )
        return 0
      }

      return 1
    })
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)
    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )

    let branches = await git.branchList(false)

    expect(branches).toHaveLength(1)
    expect(branches.sort()).toEqual(['foo'].sort())
  })
})

describe('Test fetchDepth and fetchTags options', () => {
  beforeEach(async () => {
    jest.spyOn(fshelper, 'fileExistsSync').mockImplementation(jest.fn())
    jest.spyOn(fshelper, 'directoryExistsSync').mockImplementation(jest.fn())
    mockExec.mockImplementation((path, args, options) => {
      console.log(args, options.listeners.stdout)

      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }

      return 0
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should call execGit with the correct arguments when fetchDepth is 0 and fetchTags is true', async () => {
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)
    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )

    const refSpec = ['refspec1', 'refspec2']
    const options = {
      filter: 'filterValue',
      fetchDepth: 0,
      fetchTags: true
    }

    await git.fetch(refSpec, options)

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      [
        '-c',
        'protocol.version=2',
        'fetch',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--filter=filterValue',
        'origin',
        'refspec1',
        'refspec2'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when fetchDepth is 0 and fetchTags is false', async () => {
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)

    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )
    const refSpec = ['refspec1', 'refspec2']
    const options = {
      filter: 'filterValue',
      fetchDepth: 0,
      fetchTags: false
    }

    await git.fetch(refSpec, options)

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      [
        '-c',
        'protocol.version=2',
        'fetch',
        '--no-tags',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--filter=filterValue',
        'origin',
        'refspec1',
        'refspec2'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when fetchDepth is 1 and fetchTags is false', async () => {
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)

    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )
    const refSpec = ['refspec1', 'refspec2']
    const options = {
      filter: 'filterValue',
      fetchDepth: 1,
      fetchTags: false
    }

    await git.fetch(refSpec, options)

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      [
        '-c',
        'protocol.version=2',
        'fetch',
        '--no-tags',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--filter=filterValue',
        '--depth=1',
        'origin',
        'refspec1',
        'refspec2'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when fetchDepth is 1 and fetchTags is true', async () => {
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)

    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )
    const refSpec = ['refspec1', 'refspec2']
    const options = {
      filter: 'filterValue',
      fetchDepth: 1,
      fetchTags: true
    }

    await git.fetch(refSpec, options)

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      [
        '-c',
        'protocol.version=2',
        'fetch',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--filter=filterValue',
        '--depth=1',
        'origin',
        'refspec1',
        'refspec2'
      ],
      expect.any(Object)
    )
  })
})
