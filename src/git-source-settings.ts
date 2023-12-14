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
   * The filter determining which objects to include
   */
  filter: string | undefined

  /**
   * The array of folders to make the sparse checkout
   */
  sparseCheckout: string[]

  /**
   * Indicates whether to use cone mode in the sparse checkout (if any)
   */
  sparseCheckoutConeMode: boolean

  /**
   * The depth when fetching
   */
  fetchDepth: number

  /**
   * Fetch tags, even if fetchDepth > 0 (default: false)
   */
  fetchTags: boolean

  /**
   * Indicates whether to use the --progress option when fetching
   */
  showProgress: boolean

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
   * Indicates the number of parallel jobs to use when fetching submodules
   */
  submodulesFetchJobs: string

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
