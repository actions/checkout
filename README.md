# checkout

This action checks out your repository to `$GITHUB_WORKSPACE`, so that your workflow can access the contents of your repository.

By default, this is equivalent to running `git fetch` and `git checkout $GITHUB_SHA`, so that you'll always have your repo contents at the version that triggered the workflow.
See [here](https://help.github.com/en/articles/events-that-trigger-workflows) to learn what `$GITHUB_SHA` is for different kinds of events.

# Usage

See [action.yml](action.yml)

Basic:

```yaml
steps:
- uses: actions/checkout@master
- uses: actions/setup-node@master
  with:
    node-version: 10.x 
- run: npm install
- run: npm test
```

By default, the branch or tag ref that triggered the workflow will be checked out. If you wish to check out a different branch, specify that using `with.ref`:

```yaml
- uses: actions/checkout@master
  with:
    ref: some-branch
```

For more details, see [Contexts and expression syntax for GitHub Actions](https://help.github.com/en/articles/contexts-and-expression-syntax-for-github-actions)

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
