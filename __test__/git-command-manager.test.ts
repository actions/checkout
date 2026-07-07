import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll
} from '@jest/globals'

// Mock @actions/exec
const mockExec = jest.fn()
jest.unstable_mockModule('@actions/exec', () => ({
  exec: mockExec
}))

// Mock fs-helper
const mockFileExistsSync = jest.fn()
const mockDirectoryExistsSync = jest.fn()
jest.unstable_mockModule('../src/fs-helper.js', () => ({
  fileExistsSync: mockFileExistsSync,
  directoryExistsSync: mockDirectoryExistsSync
}))

// Dynamic imports after mocking
const commandManager = await import('../src/git-command-manager.js')
type IGitCommandManager =
  import('../src/git-command-manager.js').IGitCommandManager

let git: IGitCommandManager

describe('git-auth-helper tests', () => {
  beforeAll(async () => {})

  beforeEach(async () => {
    mockFileExistsSync.mockReset()
    mockDirectoryExistsSync.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {})

  it('branch list matches', async () => {
    mockExec.mockImplementation((path: any, args: any, options: any) => {
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
    // exec.exec is already mockExec
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
    mockExec.mockImplementation((path: any, args: any, options: any) => {
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
    // exec.exec is already mockExec
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
    mockFileExistsSync.mockReset()
    mockDirectoryExistsSync.mockReset()
    mockExec.mockImplementation((path: any, args: any, options: any) => {
      console.log(args, options.listeners.stdout)

      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }

      return 0
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should call execGit with the correct arguments when fetchDepth is 0', async () => {
    // exec.exec is already mockExec
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
    // exec.exec is already mockExec

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
    // exec.exec is already mockExec

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
    // exec.exec is already mockExec

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
    // exec.exec is already mockExec

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
    // exec.exec is already mockExec

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
    // exec.exec is already mockExec

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

describe('Test submoduleUpdate filter option', () => {
  beforeEach(async () => {
    mockFileExistsSync.mockReset()
    mockDirectoryExistsSync.mockReset()
    mockExec.mockImplementation((path: any, args: any, options: any) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }

      return 0
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should call execGit with --filter when a filter option is provided', async () => {
    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )

    await git.submoduleUpdate(1, true, 'blob:none')

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      [
        '-c',
        'protocol.version=2',
        'submodule',
        'update',
        '--init',
        '--force',
        '--depth=1',
        '--recursive',
        '--filter=blob:none'
      ],
      expect.any(Object)
    )
  })

  it('should call execGit without --filter when no filter option is provided', async () => {
    const workingDirectory = 'test'
    const lfs = false
    const doSparseCheckout = false
    git = await commandManager.createCommandManager(
      workingDirectory,
      lfs,
      doSparseCheckout
    )

    await git.submoduleUpdate(0, false, undefined)

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['-c', 'protocol.version=2', 'submodule', 'update', '--init', '--force'],
      expect.any(Object)
    )
  })
})

describe('repository initialization object format', () => {
  beforeEach(async () => {
    mockFileExistsSync.mockReset()
    mockDirectoryExistsSync.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('initializes SHA-256 repositories with the matching object format', async () => {
    mockExec.mockImplementation((path: any, args: any, options: any) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('git version 2.50.1'))
      }

      return 0
    })
    // exec.exec is already mockExec

    git = await commandManager.createCommandManager('test', false, false)

    await git.init('sha256')

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['init', '--object-format=sha256', 'test'],
      expect.any(Object)
    )
  })

  it('initializes SHA-1 repositories with existing default arguments', async () => {
    mockExec.mockImplementation((path: any, args: any, options: any) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('git version 2.50.1'))
      }

      return 0
    })
    // exec.exec is already mockExec

    git = await commandManager.createCommandManager('test', false, false)

    await git.init('sha1')

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      ['init', 'test'],
      expect.any(Object)
    )
  })
})

describe('git user-agent with orchestration ID', () => {
  beforeEach(async () => {
    mockFileExistsSync.mockReset()
    mockDirectoryExistsSync.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
    // Clean up environment variable to prevent test pollution
    delete process.env['ACTIONS_ORCHESTRATION_ID']
  })

  it('should include orchestration ID in user-agent when ACTIONS_ORCHESTRATION_ID is set', async () => {
    const orchId = 'test-orch-id-12345'
    process.env['ACTIONS_ORCHESTRATION_ID'] = orchId

    let capturedEnv: any = null
    mockExec.mockImplementation((path: any, args: any, options: any) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }
      // Capture env on any command
      capturedEnv = options.env
      return 0
    })
    // exec.exec is already mockExec

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
    mockExec.mockImplementation((path: any, args: any, options: any) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }
      // Capture env on any command
      capturedEnv = options.env
      return 0
    })
    // exec.exec is already mockExec

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
    mockExec.mockImplementation((path: any, args: any, options: any) => {
      if (args.includes('version')) {
        options.listeners.stdout(Buffer.from('2.18'))
      }
      // Capture env on any command
      capturedEnv = options.env
      return 0
    })
    // exec.exec is already mockExec

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
