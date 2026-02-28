#!/bin/sh

if [ ! -f "./basic/basic-file.txt" ]; then
    echo "Expected basic file does not exist"
    exit 1
fi

if [ "$1" = "--archive" ]; then
  # Verify no .git folder
  if [ -d "./basic/.git" ]; then
    echo "Did not expect ./basic/.git folder to exist"
    exit 1
  fi
else
  # Verify .git folder
  if [ ! -d "./basic/.git" ]; then
    echo "Expected ./basic/.git folder to exist"
    exit 1
  fi

  # Verify that sparse-checkout is disabled.
  SPARSE_CHECKOUT_ENABLED=$(git -C ./basic config --local --get-all core.sparseCheckout)
  if [ "$SPARSE_CHECKOUT_ENABLED" != "" ]; then
    echo "Expected sparse-checkout to be disabled (discovered: $SPARSE_CHECKOUT_ENABLED)"
    exit 1
  fi

  # Verify git configuration shows worktreeConfig is effectively disabled
  WORKTREE_CONFIG_ENABLED=$(git -C ./basic config --local --get-all extensions.worktreeConfig)
  if [[ "$WORKTREE_CONFIG_ENABLED" != "" ]]; then
    echo "Expected extensions.worktreeConfig (boolean) to be disabled in git config.  This could be an artifact of sparse checkout functionality."
    exit 1
  fi

  # Verify auth token
  cd basic
  git fetch --no-tags --depth=1 origin +refs/heads/main:refs/remotes/origin/main
fi
