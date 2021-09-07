[![Build and Test](https://github.com/actions/checkout/actions/workflows/test.yml/badge.svg)](https://github.com/actions/checkout/actions/workflows/test.yml)

# Checkout V3

This action checks-out your repository under `$GITHUB_WORKSPACE`, so your workflow can access it.

Only a single commit is fetched by default, for the ref/SHA that triggered the workflow. Set `fetch-depth: 0` to fetch all history for all branches and tags. Refer [here](https://help.github.com/en/articles/events-that-trigger-workflows) to learn which commit `$GITHUB_SHA` points to for different events.

The auth token is persisted in the local git config. This enables your scripts to run authenticated git commands. The token is removed during post-job cleanup. Set `persist-credentials: false` to opt-out.

When Git 2.18 or higher is not in your PATH, falls back to the REST API to download the files.

# What's new

- Updated to the node16 runtime by default
  - This requires a minimum [Actions Runner](https://github.com/actions/runner/releases/tag/v2.285.0) version of v2.285.0 to run, which is by default available in GHES 3.4 or later.

# Usage

<!-- start usage -->
```yaml
- uses: actions/checkout@v3
  with:
    # Repository name with owner. For example, actions/checkout
    # Default: ${{ github.repository }}
    repository: ''

    # The branch, tag or SHA to checkout. When checking out the repository that
    # triggered a workflow, this defaults to the reference or SHA for that event.
    # Otherwise, uses the default branch.
    ref: ''

    # Personal access token (PAT) used to fetch the repository. The PAT is configured
    # with the local git config, which enables your scripts to run authenticated git
    # commands. The post-job step removes the PAT.
    #
    # We recommend using a service account with the least permissions necessary. Also
    # when generating a new PAT, select the least scopes necessary.
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    #
    # Default: ${{ github.token }}
    token: ''

    # SSH key used to fetch the repository. The SSH key is configured with the local
    # git config, which enables your scripts to run authenticated git commands. The
    # post-job step removes the SSH key.
    #
    # We recommend using a service account with the least permissions necessary.
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    ssh-key: ''

    # Known hosts in addition to the user and global host key database. The public SSH
    # keys for a host may be obtained using the utility `ssh-keyscan`. For example,
    # `ssh-keyscan github.com`. The public key for github.com is always implicitly
    # added.
    ssh-known-hosts: ''

    # Whether to perform strict host key checking. When true, adds the options
    # `StrictHostKeyChecking=yes` and `CheckHostIP=no` to the SSH command line. Use
    # the input `ssh-known-hosts` to configure additional hosts.
    # Default: true
    ssh-strict: ''

    # Whether to configure the token or SSH key with the local git config
    # Default: true
    persist-credentials: ''

    # Relative path under $GITHUB_WORKSPACE to place the repository
    path: ''

    # Whether to execute `git clean -ffdx && git reset --hard HEAD` before fetching
    # Default: true
    clean: ''

    # Do a sparse checkout on given patterns. Each pattern should be separated with
    # new lines
    # Default: null
    sparse-checkout: ''

    # Specifies whether to use cone-mode when doing a sparse checkout.
    # Default: true
    sparse-checkout-cone-mode: ''

    # Number of commits to fetch. 0 indicates all history for all branches and tags.
    # Default: 1
    fetch-depth: ''

    # Whether to fetch tags, even if fetch-depth > 0.
    # Default: false
    fetch-tags: ''

    # Whether to download Git-LFS files
    # Default: false
    lfs: ''

    # Whether to checkout submodules: `true` to checkout submodules or `recursive` to
    # recursively checkout submodules.
    #
    # When the `ssh-key` input is not provided, SSH URLs beginning with
    # `git@github.com:` are converted to HTTPS.
    #
    # Default: false
    submodules: ''

    # Add repository path as safe.directory for Git global config by running `git
    # config --global --add safe.directory <path>`
    # Default: true
    set-safe-directory: ''

    # The base URL for the GitHub instance that you are trying to clone from, will use
    # environment defaults to fetch from the same instance that the workflow is
    # running from unless specified. Example URLs are https://github.com or
    # https://my-ghes-server.example.com
    github-server-url: ''
```
<!-- end usage -->

# Scenarios

- [Fetch only the root files](#Fetch-only-the-root-files)
- [Fetch only the root files and `.github` and `src` folder](#Fetch-only-the-root-files-and-github-and-src-folder)
- [Fetch only a single file](#Fetch-only-a-single-file)
- [Fetch all history for all tags and branches](#Fetch-all-history-for-all-tags-and-branches)
- [Checkout a different branch](#Checkout-a-different-branch)
- [Checkout HEAD^](#Checkout-HEAD)
- [Checkout multiple repos (side by side)](#Checkout-multiple-repos-side-by-side)
- [Checkout multiple repos (nested)](#Checkout-multiple-repos-nested)
- [Checkout multiple repos (private)](#Checkout-multiple-repos-private)
- [Checkout pull request HEAD commit instead of merge commit](#Checkout-pull-request-HEAD-commit-instead-of-merge-commit)
- [Checkout pull request on closed event](#Checkout-pull-request-on-closed-event)
- [Push a commit using the built-in token](#Push-a-commit-using-the-built-in-token)

## Fetch only the root files

```yaml
- uses: actions/checkout@v3
  with:
    sparse-checkout: .
```

## Fetch only the root files and `.github` and `src` folder

```yaml
- uses: actions/checkout@v3
  with:
    sparse-checkout: |
      .github
      src
```

## Fetch only a single file

```yaml
- uses: actions/checkout@v3
  with:
    sparse-checkout: |
      README.md
    sparse-checkout-cone-mode: false
```

## Fetch all history for all tags and branches

```yaml
- uses: actions/checkout@v3
  with:
    fetch-depth: 0
```

## Checkout a different branch

```yaml
- uses: actions/checkout@v3
  with:
    ref: my-branch
```

## Checkout HEAD^

```yaml
- uses: actions/checkout@v3
  with:
    fetch-depth: 2
- run: git checkout HEAD^
```

## Checkout multiple repos (side by side)

```yaml
- name: Checkout
  uses: actions/checkout@v3
  with:
    path: main

- name: Checkout tools repo
  uses: actions/checkout@v3
  with:
    repository: my-org/my-tools
    path: my-tools
```
> - If your secondary repository is private you will need to add the option noted in [Checkout multiple repos (private)](#Checkout-multiple-repos-private)

## Checkout multiple repos (nested)

```yaml
- name: Checkout
  uses: actions/checkout@v3

- name: Checkout tools repo
  uses: actions/checkout@v3
  with:
    repository: my-org/my-tools
    path: my-tools
```
> - If your secondary repository is private you will need to add the option noted in [Checkout multiple repos (private)](#Checkout-multiple-repos-private)

## Checkout multiple repos (private)

```yaml
- name: Checkout
  uses: actions/checkout@v3
  with:
    path: main

- name: Checkout private tools
  uses: actions/checkout@v3
  with:
    repository: my-org/my-private-tools
    token: ${{ secrets.GH_PAT }} # `GH_PAT` is a secret that contains your PAT
    path: my-tools
```

> - `${{ github.token }}` is scoped to the current repository, so if you want to checkout a different repository that is private you will need to provide your own [PAT](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).


## Checkout pull request HEAD commit instead of merge commit

```yaml
- uses: actions/checkout@v3
  with:
    ref: ${{ github.event.pull_request.head.sha }}
```

## Checkout pull request on closed event

```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, closed]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
```

## Push a commit using the built-in token

```yaml
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          date > generated.txt
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add .
          git commit -m "generated"
          git push
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
