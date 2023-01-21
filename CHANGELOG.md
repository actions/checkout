# Changelog

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
