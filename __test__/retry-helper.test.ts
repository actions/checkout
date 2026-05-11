import * as core from '@actions/core'
import {RetryHelper} from '../lib/retry-helper'

let info: string[]

describe('retry-helper tests', () => {
  beforeAll(() => {
    // Mock @actions/core info()
    jest.spyOn(core, 'info').mockImplementation((message: string) => {
      info.push(message)
    })
  })

  beforeEach(() => {
    // Reset info
    info = []
  })

  afterAll(() => {
    // Restore
    jest.restoreAllMocks()
  })

  it('first attempt succeeds', async () => {
    const retryHelper: any = new RetryHelper(3, 1, 10)
    const sleep = jest.fn().mockResolvedValue(undefined)
    retryHelper.sleep = sleep

    const actual = await retryHelper.execute(async () => {
      return 'some result'
    })
    expect(actual).toBe('some result')
    expect(info).toHaveLength(0)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('second attempt succeeds', async () => {
    const retryHelper: any = new RetryHelper(3, 1, 10)
    const sleep = jest.fn().mockResolvedValue(undefined)
    retryHelper.sleep = sleep
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
    expect(info[1]).toBe('Waiting 1 seconds before trying again')
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(1)
  })

  it('third attempt succeeds', async () => {
    const retryHelper: any = new RetryHelper(3, 1, 10)
    const sleep = jest.fn().mockResolvedValue(undefined)
    retryHelper.sleep = sleep
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
    expect(info[1]).toBe('Waiting 1 seconds before trying again')
    expect(info[2]).toBe('some error 2')
    expect(info[3]).toBe('Waiting 2 seconds before trying again')
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, 1)
    expect(sleep).toHaveBeenNthCalledWith(2, 2)
  })

  it('all attempts fail succeeds', async () => {
    const retryHelper: any = new RetryHelper(3, 1, 10)
    const sleep = jest.fn().mockResolvedValue(undefined)
    retryHelper.sleep = sleep
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
    expect(info[1]).toBe('Waiting 1 seconds before trying again')
    expect(info[2]).toBe('some error 2')
    expect(info[3]).toBe('Waiting 2 seconds before trying again')
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, 1)
    expect(sleep).toHaveBeenNthCalledWith(2, 2)
  })

  it('server-side 500 errors are retried with exponential backoff', async () => {
    const retryHelper: any = new RetryHelper(4, 2, 10)
    const sleep = jest.fn().mockResolvedValue(undefined)
    retryHelper.sleep = sleep
    let attempts = 0

    const actual = await retryHelper.execute(() => {
      if (++attempts < 3) {
        const error: Error & {status?: number} = new Error(
          `server error ${attempts}`
        )
        error.status = 500
        throw error
      }

      return Promise.resolve('some result')
    })

    expect(actual).toBe('some result')
    expect(attempts).toBe(3)
    expect(info).toEqual([
      'server error 1',
      'Waiting 2 seconds before trying again',
      'server error 2',
      'Waiting 4 seconds before trying again'
    ])
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, 2)
    expect(sleep).toHaveBeenNthCalledWith(2, 4)
  })
})
