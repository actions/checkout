# Changelog

## v2.5.0
- [Bump @actions/core to v1.10.0](https://github.com/actions/checkout/pull/962)

## v2.4.2
- [Add input `set-safe-directory`](https://github.com/actions/checkout/pull/776)

## v2.4.1
- [Set the safe directory option on git to prevent git commands failing when running in containers](https://github.com/actions/checkout/pull/762)

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
