<p align="center">
  <a href="https://github.com/actions/checkout"><img alt="GitHub Actions status" src="https://github.com/actions/checkout/workflows/test-local/badge.svg"></a>
</p>

# Checkout V2 beta

This action checks-out your repository under `$GITHUB_WORKSPACE`, so your workflow can access it.

By default, the repository that triggered the workflow is checked-out, for the ref/SHA that triggered the event.

Refer [here](https://help.github.com/en/articles/events-that-trigger-workflows) to learn which commit `$GITHUB_SHA` points to for different events.

Changes in V2:
- Improved fetch performance
  - The default behavior now fetches only the SHA being checked-out
- Script authenticated git commands
  - Persists `with.token` in the local git config
  - Enables your scripts to run authenticated git commands
  - Post-job cleanup removes the token
  - Coming soon: Opt out by setting `with.persist-credentials` to `false`
- Creates a local branch
  - No longer detached HEAD when checking out a branch
  - A local branch is created with the corresponding upstream branch set
- Improved layout
  - `with.path` is always relative to `github.workspace`
  - Aligns better with container actions, where `github.workspace` gets mapped in
- Removed input `submodules`

Refer [here](https://github.com/actions/checkout/blob/v1/README.md) for previous versions.

# Usage

<!-- start usage -->
```yaml
- uses: actions/checkout@v2-beta
  with:
    # Repository name
    # Default: ${{ github.repository }}
    repository: ''

    # Ref to checkout (SHA, branch, tag). For the repository that triggered the
    # workflow, defaults to the ref/SHA for the event. Otherwise defaults to master.
    ref: ''

    # Access token for clone repository
    # Default: ${{ github.token }}
    token: ''

    # Relative path under $GITHUB_WORKSPACE to place the repository
    path: ''

    # Whether to execute `git clean -ffdx && git reset --hard HEAD` before fetching
    # Default: true
    clean: ''

    # Number of commits to fetch. 0 indicates all history.
    # Default: 1
    fetch-depth: ''

    # Whether to download Git-LFS files
    # Default: false
    lfs: ''
```
<!-- end usage -->

## Checkout a different branch

```yaml
- uses: actions/checkout@preview
  with:
    ref: some-branch
```

## Checkout a different, private repository

```yaml
- uses: actions/checkout@preview
  with:
    repository: myAccount/myRepository
    ref: refs/heads/master
    token: ${{ secrets.GitHub_PAT }} # `GitHub_PAT` is a secret that contains your PAT
```
> - `${{ github.token }}` is scoped to the current repository, so if you want to checkout another repository that is private you will need to provide your own [PAT](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
