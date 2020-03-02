export interface IGitSourceSettings {
  repositoryPath: string
  repositoryOwner: string
  repositoryName: string
  ref: string
  commit: string
  clean: boolean
  fetchDepth: number
  lfs: boolean
  authToken: string
  persistCredentials: boolean
}
