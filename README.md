# checkout

This action checks out your repository so that your workflow operates from the root of the repository

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

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
