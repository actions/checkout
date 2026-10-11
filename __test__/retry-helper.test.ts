import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll
} from '@jest/globals'

let info: string[] = []

// Mock @actions/core before loading retry-helper
jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn((message: string) => {
    info.push(message)
  }),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}))

// Dynamic imports after mocking
const {RetryHelper} = await import('../src/retry-helper.js')

let retryHelper: any

describe('retry-helper tests', () => {
  beforeAll(() => {
    retryHelper = new RetryHelper(3, 0, 0)
  })

  beforeEach(() => {
    // Reset info
    info = []
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  it('first attempt succeeds', async () => {
    const actual = await retryHelper.execute(async () => {
      return 'some result'
    })
    expect(actual).toBe('some result')
    expect(info).toHaveLength(0)
  })

  it('second attempt succeeds', async () => {
    let attempts = 0
    const actual = await retryHelper.execute(() => {
      if (++attempts == 1) {
        throw new Error('some error')
      }

      return Promise.resolve('some result')
    })
    expect(attempts).toBe(2)
    expect(actual).toBe('some result')
    expect(info).toHaveLength(2)
    expect(info[0]).toBe('some error')
    expect(info[1]).toMatch(/Waiting .+ seconds before trying again/)
  })

  it('third attempt succeeds', async () => {
    let attempts = 0
    const actual = await retryHelper.execute(() => {
      if (++attempts < 3) {
        throw new Error(`some error ${attempts}`)
      }

      return Promise.resolve('some result')
    })
    expect(attempts).toBe(3)
    expect(actual).toBe('some result')
    expect(info).toHaveLength(4)
    expect(info[0]).toBe('some error 1')
    expect(info[1]).toMatch(/Waiting .+ seconds before trying again/)
    expect(info[2]).toBe('some error 2')
    expect(info[3]).toMatch(/Waiting .+ seconds before trying again/)
  })

  it('all attempts fail succeeds', async () => {
    let attempts = 0
    let error: Error = null as unknown as Error
    try {
      await retryHelper.execute(() => {
        throw new Error(`some error ${++attempts}`)
      })
    } catch (err) {
      error = err as Error
    }
    expect(error.message).toBe('some error 3')
    expect(attempts).toBe(3)
    expect(info).toHaveLength(4)
    expect(info[0]).toBe('some error 1')
    expect(info[1]).toMatch(/Waiting .+ seconds before trying again/)
    expect(info[2]).toBe('some error 2')
    expect(info[3]).toMatch(/Waiting .+ seconds before trying again/)
  })
})
