# GitHub Actions Checkout - AI Coding Instructions

## Project Overview

This is the official `actions/checkout` GitHub Action for checking out repositories in workflows. It's a TypeScript project that compiles to a single bundled JavaScript file (`dist/index.js`) and supports both git-based and REST API-based repository downloads.

## Architecture & Key Components

### Core Entry Points
- **`src/main.ts`**: Main entry point with `run()` and `cleanup()` functions, determined by `stateHelper.IsPost`
- **`src/git-source-provider.ts`**: Primary orchestrator for repository acquisition (git vs REST API fallback)
- **`src/input-helper.ts`**: Input validation and GitHub Actions input processing
- **`action.yml`**: Defines the action interface with comprehensive input/output schema

### Critical Data Flow
1. `main.ts` → `inputHelper.getInputs()` → validates and transforms action inputs
2. `main.ts` → `gitSourceProvider.getSource(settings)` → orchestrates repository download
3. `git-source-provider.ts` decides: use Git CLI or fallback to GitHub REST API
4. State management via `state-helper.ts` for POST action cleanup

### Authentication & Security Patterns
- **Token-based auth**: Uses `@actions/core` to handle GitHub tokens securely
- **SSH key management**: Configures temporary SSH keys in `git-auth-helper.ts`
- **Safe directory**: Automatically configures `git config safe.directory` for container compatibility

## Development Workflow

### Essential Commands
```bash
npm ci                    # Install dependencies
npm run build            # TypeScript → JavaScript + bundle with ncc + generate docs
npm run format           # Prettier formatting
npm run lint            # ESLint validation
npm test                # Jest test suite
```

### Build Process (Critical!)
- **`npm run build`** runs: `tsc && ncc build && node lib/misc/generate-docs.js`
- **Documentation sync**: `src/misc/generate-docs.ts` auto-updates README.md usage section from `action.yml`
- **Bundling**: Uses `@vercel/ncc` to create single `dist/index.js` file
- **Always run `npm run build` before commits** - the `dist/` directory must be up-to-date

### Testing Strategy
- **Unit tests**: Jest tests in `__test__/` for all core modules
- **Integration tests**: Shell scripts (`__test__/verify-*.sh`) test real git operations
- **E2E tests**: `.github/workflows/test.yml` tests across OS matrix with actual GitHub repos

## Project-Specific Conventions

### TypeScript Patterns
- **Interface-driven**: `IGitSourceSettings` centralizes all configuration
- **Async/await**: All I/O operations use async patterns, not promises
- **Error handling**: Use `core.setFailed()` for action failures, `core.warning()` for non-critical issues

### Git Operation Patterns
```typescript
// Check Git version and fallback pattern
const git = await getGitCommandManager(settings)
if (git) {
  // Use Git CLI
  await git.fetch(refSpec, fetchDepth)
} else {
  // Fallback to REST API
  await githubApiHelper.downloadRepository(...)
}
```

### State Management (Unique Pattern!)
- **Dual-phase execution**: Same script runs twice (MAIN + POST) determined by `stateHelper.IsPost`
- **State persistence**: Use `core.saveState()` / `core.getState()` to pass data between phases
- **Cleanup responsibility**: POST phase cleans up auth tokens, SSH keys, etc.

### Input Validation Approach
- **GitHub context integration**: Defaults repository from `github.context.repo`
- **Path safety**: Validates paths are within `GITHUB_WORKSPACE`
- **Flexible refs**: Handles branches, tags, SHAs, and PR refs uniformly

## Integration Points

### GitHub Actions SDK Usage
- **`@actions/core`**: Input/output, logging, state management
- **`@actions/github`**: GitHub context and API access
- **`@actions/exec`**: Git command execution
- **`@actions/io`**: File system operations

### Git Integration
- **Version compatibility**: Minimum Git 2.18, with feature detection for sparse-checkout
- **Authentication modes**: Token-based (default) or SSH key-based
- **Advanced features**: LFS, submodules, sparse-checkout, partial clones

### Container Support
- **Safe directory**: Critical for container workflows - auto-configures git safe.directory
- **Credential persistence**: Configures git credential helper for authenticated operations

## Common Debugging Patterns

### Enable Debug Logging
```yaml
steps:
  - uses: actions/checkout@v5
    env:
      ACTIONS_STEP_DEBUG: true
```

### REST API Fallback Testing
```bash
# Force REST API mode by overriding Git version
__test__/override-git-version.sh
```

### Authentication Issues
- Check `GITHUB_TOKEN` permissions: needs `contents: read`
- For private repos: requires PAT with repo access
- Container issues: verify safe.directory configuration

## Key Files for Understanding
- `src/git-source-provider.ts` - Main orchestration logic
- `src/input-helper.ts` - Action interface and validation
- `src/git-auth-helper.ts` - Authentication and credential management
- `action.yml` - Complete input/output specification
- `.github/workflows/test.yml` - Comprehensive test scenarios