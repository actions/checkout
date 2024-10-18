export interface IGitSourceSettings {
  /**
   * The location on disk where the repository will be placed
   */
  repositoryPath: string

  /**
   * The repository owner
   */
  repositoryOwner: string

  /**
   * The repository name
   */
  repositoryName: string

  /**
   * The ref to fetch
   */
  ref: string

  /**
   * The commit to checkout
   */
  commit: string

  /**
   * Indicates whether to clean the repository
   */
  clean: boolean

  /**
   * The depth when fetching
   */
  fetchDepth: number

  /**
   * Indicates whether to fetch LFS objects
   */
  lfs: boolean

  /**
   * Indicates whether to checkout submodules
   */
  submodules: boolean

  /**
   * Indicates whether to recursively checkout submodules
   */
  nestedSubmodules: boolean

  /**
   * The auth token to use when fetching the repository
   */
  authToken: string

  /**
   * The SSH key to configure
   */
  sshKey: string

  /**
   * Additional SSH known hosts
   */
  sshKnownHosts: string

  /**
   * Indicates whether the server must be a known host
   */
  sshStrict: boolean

  /**
   * Indicates whether to persist the credentials on disk to enable scripting authenticated git commands
   */
  persistCredentials: boolean

  /**
   * Organization ID for the currently running workflow (used for auth settings)
   */
  workflowOrganizationId: number | undefined

  /**
   * Indicates whether to add repositoryPath as safe.directory in git global config
   */
  setSafeDirectory: boolean

  /**
   * User override on the GitHub Server/Host URL that hosts the repository to be cloned
   */
  githubServerUrl: string | undefined
}
