# Changelog

## v4.1.0
- [Add support for partial checkout filters](https://github.com/actions/checkout/pull/1396)

## v4.0.0
- [Support fetching without the --progress option](https://github.com/actions/checkout/pull/1067)
- [Update to node20](https://github.com/actions/checkout/pull/1436)

## v3.6.0
- [Fix: Mark test scripts with Bash'isms to be run via Bash](https://github.com/actions/checkout/pull/1377)
- [Add option to fetch tags even if fetch-depth > 0](https://github.com/actions/checkout/pull/579)

## v3.5.3
- [Fix: Checkout fail in self-hosted runners when faulty submodule are checked-in](https://github.com/actions/checkout/pull/1196)
- [Fix typos found by codespell](https://github.com/actions/checkout/pull/1287)
- [Add support for sparse checkouts](https://github.com/actions/checkout/pull/1369)

## v3.5.2
- [Fix api endpoint for GHES](https://github.com/actions/checkout/pull/1289)

## v3.5.1
- [Fix slow checkout on Windows](https://github.com/actions/checkout/pull/1246)

## v3.5.0
* [Add new public key for known_hosts](https://github.com/actions/checkout/pull/1237)

## v3.4.0
- [Upgrade codeql actions to v2](https://github.com/actions/checkout/pull/1209)
- [Upgrade dependencies](https://github.com/actions/checkout/pull/1210)
- [Upgrade @actions/io](https://github.com/actions/checkout/pull/1225)

## v3.3.0
- [Implement branch list using callbacks from exec function](https://github.com/actions/checkout/pull/1045)
- [Add in explicit reference to private checkout options](https://github.com/actions/checkout/pull/1050)
- [Fix comment typos (that got added in #770)](https://github.com/actions/checkout/pull/1057)

## v3.2.0
- [Add GitHub Action to perform release](https://github.com/actions/checkout/pull/942)
- [Fix status badge](https://github.com/actions/checkout/pull/967)
- [Replace datadog/squid with ubuntu/squid Docker image](https://github.com/actions/checkout/pull/1002)
- [Wrap pipeline commands for submoduleForeach in quotes](https://github.com/actions/checkout/pull/964)
- [Update @actions/io to 1.1.2](https://github.com/actions/checkout/pull/1029)
- [Upgrading version to 3.2.0](https://github.com/actions/checkout/pull/1039)

## v3.1.0
- [Use @actions/core `saveState` and `getState`](https://github.com/actions/checkout/pull/939)
- [Add `github-server-url` input](https://github.com/actions/checkout/pull/922)

## v3.0.2
- [Add input `set-safe-directory`](https://github.com/actions/checkout/pull/770)

## v3.0.1
- [Fixed an issue where checkout failed to run in container jobs due to the new git setting `safe.directory`](https://github.com/actions/checkout/pull/762)
- [Bumped various npm package versions](https://github.com/actions/checkout/pull/744)

## v3.0.0

- [Update to node 16](https://github.com/actions/checkout/pull/689)

## v2.3.1

- [Fix default branch resolution for .wiki and when using SSH](https://github.com/actions/checkout/pull/284)

## v2.3.0

- [Fallback to the default branch](https://github.com/actions/checkout/pull/278)

## v2.2.0

- [Fetch all history for all tags and branches when fetch-depth=0](https://github.com/actions/checkout/pull/258)

## v2.1.1

- Changes to support GHES ([here](https://github.com/actions/checkout/pull/236) and [here](https://github.com/actions/checkout/pull/248))

## v2.1.0

- [Group output](https://github.com/actions/checkout/pull/191)
- [Changes to support GHES alpha release](https://github.com/actions/checkout/pull/199)
- [Persist core.sshCommand for submodules](https://github.com/actions/checkout/pull/184)
- [Add support ssh](https://github.com/actions/checkout/pull/163)
- [Convert submodule SSH URL to HTTPS, when not using SSH](https://github.com/actions/checkout/pull/179)
- [Add submodule support](https://github.com/actions/checkout/pull/157)
- [Follow proxy settings](https://github.com/actions/checkout/pull/144)
- [Fix ref for pr closed event when a pr is merged](https://github.com/actions/checkout/pull/141)
- [Fix issue checking detached when git less than 2.22](https://github.com/actions/checkout/pull/128)

## v2.0.0

- [Do not pass cred on command line](https://github.com/actions/checkout/pull/108)
- [Add input persist-credentials](https://github.com/actions/checkout/pull/107)
- [Fallback to REST API to download repo](https://github.com/actions/checkout/pull/104)

## v2 (beta)

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


## v1

Refer [here](https://github.com/actions/checkout/blob/v1/CHANGELOG.md) for the V1 changelog
