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

By default, the branch or tag ref that triggered the workflow will be checked out. If you wish to check out a different branch, a different repository or use different token to checkout, specify that using `with.ref`, `with.repository` and `with.token`.

## Checkout different branch from the workflow repository
```yaml
- uses: actions/checkout@v1
  with:
    ref: some-branch
```

## Checkout different private repository
```yaml
- uses: actions/checkout@v1
  with:
    repository: myAccount/myRepository
    ref: refs/heads/master
    token: ${{ secrets.GitHub_PAT }} // `GitHub_PAT` is a secret contains your PAT.
```
> - `${{ github.token }}` is scoped to the current repository, so if you want to checkout another repository that is private you will need to provide your own [PAT](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).

## Checkout private submodules
```yaml
- uses: actions/checkout@v1
  with:
    submodules: true // 'recursive' 'true' or 'false'
    token: ${{ secrets.GitHub_PAT }} // `GitHub_PAT` is a secret contains your PAT.
```
> - Private submodules must be configured via `https` not `ssh`.
> - `${{ github.token }}` only has permission to the workflow triggering repository. If the repository contains any submodules that come from private repositories, you will need to add your [PAT](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line) as secret and use the secret in `with.token` to make the `checkout` action work.

For more details, see [Contexts and expression syntax for GitHub Actions](https://help.github.com/en/articles/contexts-and-expression-syntax-for-github-actions) and [Creating and using secrets (encrypted variables)](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables)

# Changelog

# V1.1.0
- Reverted Changes to automatically set Git Config and Authentication.

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
