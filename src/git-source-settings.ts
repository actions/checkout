export interface IGitSourceSettings {
  repositoryPath: string
  repositoryOwner: string
  repositoryName: string
  ref: string
  commit: string
  clean: boolean
  fetchDepth: number
  lfs: boolean
  submodules: boolean
  nestedSubmodules: boolean
  authToken: string
  sshKey: string
  sshKnownHosts: string
  sshStrict: boolean
  persistCredentials: boolean
}
