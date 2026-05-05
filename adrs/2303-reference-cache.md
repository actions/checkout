# ADR 2303: Reference cache for faster checkouts

**Date**: 2026-03-10

**Status**: Proposed

## Context

Repeated checkouts of the same repositories are expensive on runners with persistent storage.
This is especially noticeable for self-hosted runners and custom runner images that execute
many jobs against the same repositories and submodules.

Today, each checkout fetches objects from the remote even when the runner already has most of
the repository history available locally from previous jobs. This increases network traffic,
slows down checkout time, and makes recursive submodule initialization more expensive than
necessary.

Git supports reference repositories and alternates, which allow one working repository to reuse
objects from another local repository. This mechanism is a good fit for persistent runners,
provided the cache is managed safely and works for both the main repository and submodules.

## Decision

Add an optional `reference-cache` input that points to a local directory used to store managed
bare repositories for the primary repository and its submodules.

### Input

Add a new input in `action.yml`:

```yaml
  reference-cache:
    description: >
      Path to a local directory used as a reference cache for Git clones.
```

The value is exposed through `settings.referenceCache`.

### Cache layout

Each cached repository is stored as a bare repository inside the configured cache directory.

The cache directory name is derived from the repository URL by:

- replacing non-alphanumeric characters with `_`
- appending a short SHA-256 hash of the original URL to avoid collisions

Example:

```text
<reference-cache>/https___github_com_actions_checkout_8f9b1c2a.git
```

### Cache lifecycle

Introduce helper logic in `src/git-cache-helper.ts` responsible for:

- creating a bare cache repository with `git clone --bare`
- updating an existing bare cache repository with `git fetch --force`
- serializing access with file-based locking so concurrent jobs do not corrupt the cache
- using a temporary clone-and-rename flow to avoid leaving behind partial repositories

### Main repository checkout

When `reference-cache` is configured:

- prepare or update the cache for the main repository URL
- configure the checkout repository to use the cache through Git alternates
- keep the working repository attached to the cache instead of dissociating it

This allows later fetch operations to reuse local objects instead of downloading them again.

### Submodules

When submodules are enabled together with `reference-cache`, submodules are processed one by one
instead of relying solely on a monolithic `git submodule update --recursive` flow.

For each submodule:

- read the submodule URL from `.gitmodules`
- resolve relative URLs where possible
- create or update a dedicated cache for that submodule repository
- run `git submodule update --init --reference <cache> <path>` for that submodule

When recursive submodules are requested, repeat the same process inside each initialized submodule.

### Fetch depth behavior

When `reference-cache` is enabled, shallow fetches are usually counterproductive because object
negotiation overhead can outweigh the benefit of a local object store.

For that reason:

- the default `fetch-depth` is overridden to `0` when `reference-cache` is enabled
- if the user explicitly sets `fetch-depth`, keep the user-provided value and emit a warning

### No `--dissociate`

The checkout should remain connected to the reference cache.

Using `--dissociate` would copy objects into the working repository and typically require extra
repacking work, which reduces the performance benefit of the cache. If the cache is removed, the
workspace is expected to be recreated, which is acceptable for the target runner scenarios.

## Consequences

### Positive

- reduces network traffic for repeated checkouts on persistent runners
- improves checkout performance for the main repository and submodules
- reuses standard Git mechanisms instead of introducing a custom object store
- keeps cache naming deterministic and readable for administrators

### Trade-offs

- adds cache management complexity, including locking and recovery from interrupted operations
- submodule handling becomes more complex because each submodule may require its own cache
- benefits are limited on ephemeral runners, where the cache is not reused across jobs
- workspaces remain dependent on the presence of the cache until they are recreated

## Acceptance criteria

1. The `reference-cache` input can be configured and is exposed through the action settings.
2. Cache directories for the main repository and submodules follow the sanitized-URL-plus-hash naming scheme.
3. The main checkout uses Git alternates so later fetches can reuse local cached objects.
4. Submodules, including recursive submodules, can use repository-specific caches.
5. The checkout does not use `--dissociate` and remains attached to the cache for performance.
