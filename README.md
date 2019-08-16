# checkout

This action checks out your repository to `$GITHUB_WORKSPACE`, so that your workflow can access the contents of your repository.

# Usage

See [action.yml](action.yml)

Basic:
```yaml
steps:
- uses: actions/checkout@master
- uses: actions/setup-node@master
  with:
    version: 10.x 
- run: npm install
- run: npm test
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
