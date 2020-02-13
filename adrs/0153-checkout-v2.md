# ADR 0153: Checkout v2

**Date**: 2019-10-21

**Status**: Accepted

## Context

This ADR details the behavior for `actions/checkout@v2`.

The new action will be written in typescript. We are moving away from runner-plugin actions.

We want to take this opportunity to make behavioral changes, from v1. This document is scoped to those differences.

## Decision

### Inputs

- `repository`
  - The qualified repository name (owner/repo)
  - Defaults to the workflow repo
- `ref`
  - The ref to checkout
  - For the workflow repo, defaults to the branch and sha from the workflow event payload
  - Otherwise defaults to `master`
- `token`
  - Defaults to the job token
- `persist-credentials`
  - Indicates whether to embed the auth token into the git config. Allows users to script authenticated git commands.
  - Defaults to `true`
- `clean`
  - Indicates whether to run `git clean -ffdx && git reset --hard`
  - Defaults to `true`
- `lfs`
  - Indicates whether to download Git-LFS files
  - Defaults to `false`
- `path`
  - Relative path under the `github.workspace` where the repository should be created
  - Defaults to the `github.workspace`

Note:
- `persist-credentials` is new
- `fetch-depth` was removed (refer [below](#fetch) for details)
- `path` behavior is different (refer [below](#path) for details)
- `submodules` was removed (error if specified; add later if needed)

### Fallback to GitHub API

When a sufficient version of git is not in the PATH, fallback to the [web API](https://developer.github.com/v3/repos/contents/#get-archive-link) to download a tarball/zipball.

Note:
- LFS files are not included in the archive. Therefore fail if LFS is set to true.
- Submodules are also not included in the archive. However submodules are not supported by checkout v2 anyway.

### Persist credentials

Persist the token in the git config (http.extraheader). This will allow users to script authenticated git commands, like `git fetch`.

A post script will remove the credentials from the git config (cleanup for self-hosted).

Users may opt-out by specifying `persist-credentials: false`

Note:
- Users scripting `git commit` may need to set the username and email. The service does not provide any reasonable default value. Users can add `git config user.name <NAME>` and `git config user.email <EMAIL>`. We will document this guidance.
- The auth header (stored in the repo's git config), is scoped to all of github `http.https://github.com/.extraheader`
  - Additional public remotes also just work.
  - If users want to authenticate to an additional private remote, they should provide the `token` input.
  - Lines up if we add submodule support in the future. Don't need to worry about calculating relative URLs. Just works, although needs to be persisted in each submodule git config.
  - Users opt out of persisted credentials (`persist-credentials: false`), or can script the removal themselves (`git config --unset-all http.https://github.com/.extraheader`).

### Fetch

Fetch only the SHA being built and set depth=1. This significantly reduces the fetch time for large repos.

If a SHA isn't available (e.g. multi repo), then fetch only the specified ref with depth=1.

Customers can run `git fetch --unshallow` to fetch all refs/commits. We will document this guidance.

Note:
- The v1 input `fetch-depth` no longer exists. We can add this back in the future if needed.
- Fetching a single commit is supported by Git wire protocol version 2. The git client uses protocol version 0 by default. The desired protocol version can be overridden in the git config or on the fetch command line invocation (`-c protocol.version=2`). We will override on the fetch command line, for transparency.
- Git client version 2.18+ (released June 2018) is required for wire protocol version 2.

### Checkout

For CI, checkout will create a local ref with the upstream set. This allows users to script git as they normally would.

For PR, continue to checkout detached head. The PR branch is special - the branch and merge commit are created by the server. It doesn't match a users' local workflow.

Note:
- Consider deleting all local refs during cleanup if that helps avoid collisions. More testing required.

### Path

For the mainline scenario, the disk-layout behavior remains the same.

Remember, given the repo `johndoe/foo`, the mainline disk layout looks like:

```
GITHUB_WORKSPACE=/home/runner/work/foo/foo
RUNNER_WORKSPACE=/home/runner/work/foo
```

V2 introduces a new contraint on the checkout path. The location must now be under `github.workspace`. Whereas the checkout@v1 constraint was one level up, under `runner.workspace`.

V2 no longer changes `github.workspace` to follow wherever the self repo is checked-out.

These behavioral changes align better with container actions. The [documented filesystem contract](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/virtual-environments-for-github-hosted-runners#docker-container-filesystem) is:

- `/github/home`
- `/github/workspace` - Note: GitHub Actions must be run by the default Docker user (root). Ensure your Dockerfile does not set the USER instruction, otherwise you will not be able to access `GITHUB_WORKSPACE`.
- `/github/workflow`

Note:
- The tracking config will not be updated to reflect the path of the workflow repo.
- Any existing workflow repo will not be moved when the checkout path changes. In fact some customers want to checkout the workflow repo twice, side by side against different branches.
- Actions that need to operate only against the root of the self repo, should expose a `path` input.

#### Default value for `path` input

The `path` input will default to `./` which is rooted against `github.workspace`.

This default fits the mainline scenario well: single checkout

For multi-checkout, users must specify the `path` input for at least one of the repositories.

Note:
- An alternative is for the self repo to default to `./` and other repos default to `<REPO_NAME>`. However nested layout is an atypical git layout and therefore is not a good default. Users should supply the path info.

#### Example - Nested layout

The following example checks-out two repositories and creates a nested layout.

```yaml
# Self repo - Checkout to $GITHUB_WORKSPACE
- uses: checkout@v2

# Other repo - Checkout to $GITHUB_WORKSPACE/myscripts
- uses: checkout@v2
  with:
    repository: myorg/myscripts
    path: myscripts
```

#### Example - Side by side layout

The following example checks-out two repositories and creates a side-by-side layout.

```yaml
# Self repo - Checkout to $GITHUB_WORKSPACE/foo
- uses: checkout@v2
  with:
    path: foo

# Other repo - Checkout to $GITHUB_WORKSPACE/myscripts
- uses: checkout@v2
  with:
    repository: myorg/myscripts
    path: myscripts
```

#### Path impact to problem matchers

Problem matchers associate the source files with annotations.

Today the runner verifies the source file is under the `github.workspace`. Otherwise the source file property is dropped.

Multi-checkout complicates the matter. However even today submodules may cause this heuristic to be inaccurate.

A better solution is:

Given a source file path, walk up the directories until the first `.git/config` is found. Check if it matches the self repo (`url = https://github.com/OWNER/REPO`). If not, drop the source file path.

### Port to typescript

The checkout action should be a typescript action on the GitHub graph, for the following reasons:
- Enables customers to fork the checkout repo and modify
- Serves as an example for customers
- Demystifies the checkout action manifest
- Simplifies the runner
- Reduce the amount of runner code to port (if we ever do)

Note:
- This means job-container images will need git in the PATH, for checkout.

### Branching strategy and release tags

- Create a servicing branch for V1: `releases/v1`
- Merge the changes into `master`
- Release using a new tag `preview`
- When stable, release using a new tag `v2`

## Consequences

- Update the checkout action and readme
- Update samples to consume `actions/checkout@v2`
- Job containers now require git in the PATH for checkout, otherwise fallback to REST API
- Minimum git version 2.18
- Update problem matcher logic regarding source file verification (runner)