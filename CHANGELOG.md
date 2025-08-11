# Changelog

## V4.3.0
* docs: update README.md by @motss in https://github.com/actions/checkout/pull/1971
* Add internal repos for checking out multiple repositories by @mouismail in https://github.com/actions/checkout/pull/1977
* Documentation update - add recommended permissions to Readme by @benwells in https://github.com/actions/checkout/pull/2043
* Adjust positioning of user email note and permissions heading by @joshmgross in https://github.com/actions/checkout/pull/2044
* Update README.md by @nebuk89 in https://github.com/actions/checkout/pull/2194
* Update CODEOWNERS for actions by @TingluoHuang in https://github.com/actions/checkout/pull/2224
* Update package dependencies by @salmanmkc in https://github.com/actions/checkout/pull/2236

## v4.2.2
* `url-helper.ts` now leverages well-known environment variables by @jww3 in https://github.com/actions/checkout/pull/1941
* Expand unit test coverage for `isGhes` by @jww3 in https://github.com/actions/checkout/pull/1946

## v4.2.1
* Check out other refs/* by commit if provided, fall back to ref by @orhantoy in https://github.com/actions/checkout/pull/1924

## v4.2.0

* Add Ref and Commit outputs by @lucacome in https://github.com/actions/checkout/pull/1180
* Dependency updates by @dependabot- https://github.com/actions/checkout/pull/1777, https://github.com/actions/checkout/pull/1872

## v4.1.7
* Bump the minor-npm-dependencies group across 1 directory with 4 updates by @dependabot in https://github.com/actions/checkout/pull/1739
* Bump actions/checkout from 3 to 4 by @dependabot in https://github.com/actions/checkout/pull/1697
* Check out other refs/* by commit by @orhantoy in https://github.com/actions/checkout/pull/1774
* Pin actions/checkout's own workflows to a known, good, stable version. by @jww3 in https://github.com/actions/checkout/pull/1776

## v4.1.6
* Check platform to set archive extension appropriately by @cory-miller in https://github.com/actions/checkout/pull/1732

## v4.1.5
* Update NPM dependencies by @cory-miller in https://github.com/actions/checkout/pull/1703
* Bump github/codeql-action from 2 to 3 by @dependabot in https://github.com/actions/checkout/pull/1694
* Bump actions/setup-node from 1 to 4 by @dependabot in https://github.com/actions/checkout/pull/1696
* Bump actions/upload-artifact from 2 to 4 by @dependabot in https://github.com/actions/checkout/pull/1695
* README: Suggest `user.email` to be `41898282+github-actions[bot]@users.noreply.github.com` by @cory-miller in https://github.com/actions/checkout/pull/1707

## v4.1.4
- Disable `extensions.worktreeConfig` when disabling `sparse-checkout` by @jww3 in https://github.com/actions/checkout/pull/1692
- Add dependabot config by @cory-miller in https://github.com/actions/checkout/pull/1688
- Bump the minor-actions-dependencies group with 2 updates by @dependabot in https://github.com/actions/checkout/pull/1693
- Bump word-wrap from 1.2.3 to 1.2.5 by @dependabot in https://github.com/actions/checkout/pull/1643

## v4.1.3
- Check git version before attempting to disable `sparse-checkout` by @jww3 in https://github.com/actions/checkout/pull/1656
- Add SSH user parameter by @cory-miller in https://github.com/actions/checkout/pull/1685
- Update `actions/checkout` version in `update-main-version.yml` by @jww3 in https://github.com/actions/checkout/pull/1650

## v4.1.2
- Fix: Disable sparse checkout whenever `sparse-checkout` option is not present @dscho in https://github.com/actions/checkout/pull/1598

## v4.1.1
- Correct link to GitHub Docs by @peterbe in https://github.com/actions/checkout/pull/1511
- Link to release page from what's new section by @cory-miller in https://github.com/actions/checkout/pull/1514

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
