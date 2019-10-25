<p align="center">
  <a href="https://github.com/actions/checkout"><img alt="GitHub Actions status" src="https://github.com/actions/checkout/workflows/test-local/badge.svg"></a>
</p>

# Checkout

This action checks out your repository to `$GITHUB_WORKSPACE`, so that your workflow can access the contents of your repository.

By default, this is equivalent to running `git fetch` and `git checkout $GITHUB_SHA`, so that you'll always have your repo contents at the version that triggered the workflow.
See [here](https://help.github.com/en/articles/events-that-trigger-workflows) to learn what `$GITHUB_SHA` is for different kinds of events.

# Usage

See [action.yml](action.yml)

Basic:

```yaml
steps:
- uses: actions/checkout@v1
- uses: actions/setup-node@v1
  with:
    node-version: 10.x 
- run: npm install
- run: npm test
```

By default, the branch or tag ref that triggered the workflow will be checked out, `${{ github.token }}` will be used for any Git server authentication. If you wish to check out a different branch, a different repository or use different token to checkout, specify that using `with.ref`, `with.repository` and `with.token`:

Checkout different branch from the workflow repository:
```yaml
- uses: actions/checkout@v1
  with:
    ref: some-branch
```

Checkout different private repository:
```yaml
- uses: actions/checkout@v1
  with:
    repository: myAccount/myRepository
    ref: refs/heads/release
    token: ${{ secrets.GitHub_PAT }} // `GitHub_PAT` is a secret contains your PAT.
```

Checkout private submodules:
```yaml
- uses: actions/checkout@v1
  with:
    submodules: recursive
    token: ${{ secrets.GitHub_PAT }} // `GitHub_PAT` is a secret contains your PAT.
```
> - `with.token` will be used as `Basic` authentication header for https requests talk to https://github.com from `git(.exe)`, ensure those private submodules are configured via `https` not `ssh`.
> - `${{ github.token }}` only has permission to the workflow triggering repository. If the repository contains any submodules that comes from private repository, you will have to add your PAT as secret and use the secret in `with.token` to make `checkout` action work.

For more details, see [Contexts and expression syntax for GitHub Actions](https://help.github.com/en/articles/contexts-and-expression-syntax-for-github-actions) and [Creating and using secrets (encrypted variables)](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables)

# Changelog

## v1.1.0 (unreleased)
- Persist `with.token` or `${{ github.token }}` into checkout repository's git config as `http.https://github.com/.extraheader=AUTHORIZATION: basic ***` to better support scripting git

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
