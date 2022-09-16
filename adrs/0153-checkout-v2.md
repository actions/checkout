# ADR 0153: Checkout v2

**Date**: 2019-10-21

**Status**: Accepted

## Context

This ADR details the behavior for `actions/checkout@v2`.

The new action will be written in typescript. We are moving away from runner-plugin actions.

We want to take this opportunity to make behavioral changes, from v1. This document is scoped to those differences.

## Decision

### Inputs

```yaml
  repository:
    description: 'Repository name with owner. For example, actions/checkout'
    default: ${{ github.repository }}
  ref:
    description: >
      The branch, tag or SHA to checkout. When checking out the repository that
      triggered a workflow, this defaults to the reference or SHA for that
      event.  Otherwise, uses the default branch.
  token:
    description: >
      Personal access token (PAT) used to fetch the repository. The PAT is configured
      with the local git config, which enables your scripts to run authenticated git
      commands. The post-job step removes the PAT.


      We recommend using a service account with the least permissions necessary.
      Also when generating a new PAT, select the least scopes necessary.


      [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    default: ${{ github.token }}
  ssh-key:
    description: >
      SSH key used to fetch the repository. The SSH key is configured with the local
      git config, which enables your scripts to run authenticated git commands.
      The post-job step removes the SSH key.


      We recommend using a service account with the least permissions necessary.


      [Learn more about creating and using
      encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
  ssh-known-hosts:
    description: >
      Known hosts in addition to the user and global host key database. The public
      SSH keys for a host may be obtained using the utility `ssh-keyscan`. For example,
      `ssh-keyscan github.com`. The public key for github.com is always implicitly added.
  ssh-strict:
    description: >
      Whether to perform strict host key checking. When true, adds the options `StrictHostKeyChecking=yes`
      and `CheckHostIP=no` to the SSH command line. Use the input `ssh-known-hosts` to
      configure additional hosts.
    default: true
  persist-credentials:
    description: 'Whether to configure the token or SSH key with the local git config'
    default: true
  path:
    description: 'Relative path under $GITHUB_WORKSPACE to place the repository'
  clean:
    description: 'Whether to execute `git clean -ffdx && git reset --hard HEAD` before fetching'
    default: true
  fetch-depth:
    description: 'Number of commits to fetch. 0 indicates all history for all tags and branches.'
    default: 1
  lfs:
    description: 'Whether to download Git-LFS files'
    default: false
  submodules:
    description: >
      Whether to checkout submodules: `true` to checkout submodules or `recursive` to
      recursively checkout submodules.


      When the `ssh-key` input is not provided, SSH URLs beginning with `git@github.com:` are
      converted to HTTPS.
    default: false
```

Note:
- SSH support is new
- `persist-credentials` is new
- `path` behavior is different (refer [below](#path) for details)

### Fallback to GitHub API

When a sufficient version of git is not in the PATH, fallback to the [web API](https://developer.github.com/v3/repos/contents/#get-archive-link) to download a tarball/zipball.

Note:
- LFS files are not included in the archive. Therefore fail if LFS is set to true.
- Submodules are also not included in the archive.

### Persist credentials

The credentials will be persisted on disk. This will allow users to script authenticated git commands, like `git fetch`.

A post script will remove the credentials (cleanup for self-hosted).

Users may opt-out by specifying `persist-credentials: false`

Note:
- Users scripting `git commit` may need to set the username and email. The service does not provide any reasonable default value. Users can add `git config user.name <NAME>` and `git config user.email <EMAIL>`. We will document this guidance.

#### PAT

When using the `${{github.token}}` or a PAT, the token will be persisted in the local git config. The config key `http.https://github.com/.extraheader` enables an auth header to be specified on all authenticated commands `AUTHORIZATION: basic <BASE64_U:P>`.

Note:
- The auth header is scoped to all of github `http.https://github.com/.extraheader`
  - Additional public remotes also just work.
  - If users want to authenticate to an additional private remote, they should provide the `token` input.

#### SSH key

The SSH key will be written to disk under the `$RUNNER_TEMP` directory. The SSH key will
be removed by the action's post-job hook. Additionally, RUNNER_TEMP is cleared by the
runner between jobs.

The SSH key must be written with strict file permissions. The SSH client requires the file
to be read/write for the user, and not accessible by others.

The user host key database (`~/.ssh/known_hosts`) will be copied to a unique file under
`$RUNNER_TEMP`. And values from the input `ssh-known-hosts` will be added to the file.

The SSH command will be overridden for the local git config:

```sh
git config core.sshCommand 'ssh -i "$RUNNER_TEMP/path-to-ssh-key" -o StrictHostKeyChecking=yes -o CheckHostIP=no -o "UserKnownHostsFile=$RUNNER_TEMP/path-to-known-hosts"'
```

When the input `ssh-strict` is set to `false`, the options `CheckHostIP` and `StrictHostKeyChecking` will not be overridden.

Note:
- When `ssh-strict` is set to `true` (default), the SSH option `CheckHostIP` can safely be disabled.
  Strict host checking verifies the server's public key. Therefore, IP verification is unnecessary
  and noisy. For example:
  > Warning: Permanently added the RSA host key for IP address '140.82.113.4' to the list of known hosts.
- Since GIT_SSH_COMMAND overrides core.sshCommand, temporarily set the env var when fetching the repo. When creds
  are persisted, core.sshCommand is leveraged to avoid multiple checkout steps stomping over each other.
- Modify actions/runner to mount RUNNER_TEMP to enable scripting authenticated git commands from a container action.
- Refer [here](https://linux.die.net/man/5/ssh_config) for SSH config details.

### Fetch behavior

Fetch only the SHA being built and set depth=1. This significantly reduces the fetch time for large repos.

If a SHA isn't available (e.g. multi repo), then fetch only the specified ref with depth=1.

The input `fetch-depth` can be used to control the depth.

Note:
- Fetching a single commit is supported by Git wire protocol version 2. The git client uses protocol version 0 by default. The desired protocol version can be overridden in the git config or on the fetch command line invocation (`-c protocol.version=2`). We will override on the fetch command line, for transparency.
- Git client version 2.18+ (released June 2018) is required for wire protocol version 2.

### Checkout behavior

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

### Submodules

With both PAT and SSH key support, we should be able to provide frictionless support for
submodules scenarios: recursive, non-recursive, relative submodule paths.

When fetching submodules, follow the `fetch-depth` settings.

Also when fetching submodules, if the `ssh-key` input is not provided then convert SSH URLs to HTTPS: `-c url."https://github.com/".insteadOf "git@github.com:"`

Credentials will be persisted in the submodules local git config too.

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
- Merge the changes into the default branch
- Release using a new tag `preview`
- When stable, release using a new tag `v2`

## Consequences

- Update the checkout action and readme
- Update samples to consume `actions/checkout@v2`
- Job containers now require git in the PATH for checkout, otherwise fallback to REST API
- Minimum git version 2.18
- Update problem matcher logic regarding source file verification (runner)