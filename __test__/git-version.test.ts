import {GitVersion} from '../lib/git-version'

describe('git-version tests', () => {
  it('basics', async () => {
    let version = new GitVersion('')
    expect(version.isValid()).toBeFalsy()

    version = new GitVersion('asdf')
    expect(version.isValid()).toBeFalsy()

    version = new GitVersion('1.2')
    expect(version.isValid()).toBeTruthy()
    expect(version.toString()).toBe('1.2')

    version = new GitVersion('1.2.3')
    expect(version.isValid()).toBeTruthy()
    expect(version.toString()).toBe('1.2.3')
  })

  it('check minimum', async () => {
    let version = new GitVersion('4.5')
    expect(version.checkMinimum(new GitVersion('3.6'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('3.6.7'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.4'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.0'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.6'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('4.6.0'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1.2'))).toBeFalsy()

    version = new GitVersion('4.5.6')
    expect(version.checkMinimum(new GitVersion('3.6'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('3.6.7'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.4'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.5'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.6'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.7'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('4.6'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('4.6.0'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1.2'))).toBeFalsy()
  })
})
