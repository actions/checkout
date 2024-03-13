import {GitVersion} from '../src/git-version'
import {MinimumGitSparseCheckoutVersion} from '../src/git-command-manager'

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

  it('sparse checkout', async () => {
    const minSparseVer = MinimumGitSparseCheckoutVersion
    expect(new GitVersion('1.0').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('1.99').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.0').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.24').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.24.0').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.24.9').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.25').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.25.0').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.25.1').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.25.9').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.26').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.26.0').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.26.1').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.26.9').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.27').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.27.0').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.27.1').checkMinimum(minSparseVer)).toBeFalsy()
    expect(new GitVersion('2.27.9').checkMinimum(minSparseVer)).toBeFalsy()
    //                             /---------------------------------------
    //         ^^^ before         /         after vvv
    // --------------------------/
    expect(new GitVersion('2.28').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.28.0').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.28.1').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.28.9').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.29').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.29.0').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.29.1').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.29.9').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('2.99').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('3.0').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('3.99').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('4.0').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('4.99').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('5.0').checkMinimum(minSparseVer)).toBeTruthy()
    expect(new GitVersion('5.99').checkMinimum(minSparseVer)).toBeTruthy()
  })
})
