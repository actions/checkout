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

  it('should call execGit with the correct arguments when fetchDepth is 0', async () => {
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
      fetchDepth: 0
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
        '--no-recurse-submodules',
        '--filter=filterValue',
        'origin',
        'refspec1',
        'refspec2'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when fetchDepth is 0 and refSpec includes tags', async () => {
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)

    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )
    const refSpec = ['refspec1', 'refspec2', '+refs/tags/*:refs/tags/*']
    const options = {
      filter: 'filterValue',
      fetchDepth: 0
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
        '--no-recurse-submodules',
        '--filter=filterValue',
        'origin',
        'refspec1',
        'refspec2',
        '+refs/tags/*:refs/tags/*'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when fetchDepth is 1', async () => {
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
      fetchDepth: 1
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

  it('should call execGit with the correct arguments when fetchDepth is 1 and refSpec includes tags', async () => {
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)

    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )
    const refSpec = ['refspec1', 'refspec2', '+refs/tags/*:refs/tags/*']
    const options = {
      filter: 'filterValue',
      fetchDepth: 1
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
        '--no-recurse-submodules',
        '--filter=filterValue',
        '--depth=1',
        'origin',
        'refspec1',
        'refspec2',
        '+refs/tags/*:refs/tags/*'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when showProgress is true', async () => {
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
      showProgress: true
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
        '--no-recurse-submodules',
        '--progress',
        '--filter=filterValue',
        'origin',
        'refspec1',
        'refspec2'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when fetchDepth is 42 and showProgress is true', async () => {
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
      fetchDepth: 42,
      showProgress: true
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
        '--no-recurse-submodules',
        '--progress',
        '--filter=filterValue',
        '--depth=42',
        'origin',
        'refspec1',
        'refspec2'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit with the correct arguments when showProgress is true and refSpec includes tags', async () => {
    jest.spyOn(exec, 'exec').mockImplementation(mockExec)

    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )
    const refSpec = ['refspec1', 'refspec2', '+refs/tags/*:refs/tags/*']
    const options = {
      filter: 'filterValue',
      showProgress: true
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
        '--no-recurse-submodules',
        '--progress',
        '--filter=filterValue',
        'origin',
        'refspec1',
        'refspec2',
        '+refs/tags/*:refs/tags/*'
      ],
      expect.any(Object)
    )
  })
})

describe('git user-agent with orchestration ID', () => {
  beforeEach(async () => {
    jest.spyOn(fshelper, 'fileExistsSync').mockImplementation(jest.fn())
    jest.spyOn(fshelper, 'directoryExistsSync').mockImplementation(jest.fn())
  })

  afterEach(() => {
    jest.restoreAllMocks()
    // Clean up environment variable to prevent test pollution
    delete process.env['ACTIONS_ORCHESTRATION_ID']
  })

  it('should include orchestration ID in user-agent when ACTIONS_ORCHESTRATION_ID is set', async () => {
    const orchId = 'test-orch-id-12345'
    process.env['ACTIONS_ORCHESTRATION_ID'] = orchId

    let capturedEnv: any = null
    mockExec.mockImplementation((path, args, options) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }
      // Capture env on any command
      capturedEnv = options.env
      return 0
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

    // Call a git command to trigger env capture after user-agent is set
    await git.init()

    // Verify the user agent includes the orchestration ID
    expect(git).toBeDefined()
    expect(capturedEnv).toBeDefined()
    expect(capturedEnv['GIT_HTTP_USER_AGENT']).toBe(
      `git/2.18 (github-actions-checkout) actions_orchestration_id/${orchId}`
    )
  })

  it('should sanitize invalid characters in orchestration ID', async () => {
    const orchId = 'test (with) special/chars'
    process.env['ACTIONS_ORCHESTRATION_ID'] = orchId

    let capturedEnv: any = null
    mockExec.mockImplementation((path, args, options) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }
      // Capture env on any command
      capturedEnv = options.env
      return 0
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

    // Call a git command to trigger env capture after user-agent is set
    await git.init()

    // Verify the user agent has sanitized orchestration ID (spaces, parentheses, slash replaced)
    expect(git).toBeDefined()
    expect(capturedEnv).toBeDefined()
    expect(capturedEnv['GIT_HTTP_USER_AGENT']).toBe(
      'git/2.18 (github-actions-checkout) actions_orchestration_id/test__with__special_chars'
    )
  })

  it('should not modify user-agent when ACTIONS_ORCHESTRATION_ID is not set', async () => {
    delete process.env['ACTIONS_ORCHESTRATION_ID']

    let capturedEnv: any = null
    mockExec.mockImplementation((path, args, options) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }
      // Capture env on any command
      capturedEnv = options.env
      return 0
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

    // Call a git command to trigger env capture after user-agent is set
    await git.init()

    // Verify the user agent does NOT contain orchestration ID
    expect(git).toBeDefined()
    expect(capturedEnv).toBeDefined()
    expect(capturedEnv['GIT_HTTP_USER_AGENT']).toBe(
      'git/2.18 (github-actions-checkout)'
    )
  })
})
