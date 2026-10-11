#!/bin/bash
set -e

# Verify worktree credentials
# This test verifies that git credentials work in worktrees created after checkout
# Usage: verify-worktree.sh <checkout-path> <worktree-name>

CHECKOUT_PATH="$1"
WORKTREE_NAME="$2"

if [ -z "$CHECKOUT_PATH" ] || [ -z "$WORKTREE_NAME" ]; then
  echo "Usage: verify-worktree.sh <checkout-path> <worktree-name>"
  exit 1
fi

cd "$CHECKOUT_PATH"

# Add safe directory for container environments
git config --global --add safe.directory "*" 2>/dev/null || true

# Show the includeIf configuration
echo "Git config includeIf entries:"
git config --list --show-origin | grep -i include || true

# Create the worktree
echo "Creating worktree..."
git worktree add "../$WORKTREE_NAME" HEAD --detach

# Change to worktree directory
cd "../$WORKTREE_NAME"

# Verify we're in a worktree
echo "Verifying worktree gitdir:"
cat .git

# Verify credentials are available in worktree by checking extraheader is configured
echo "Checking credentials in worktree..."
if git config --list --show-origin | grep -q "extraheader"; then
  echo "Credentials are configured in worktree"
else
  echo "ERROR: Credentials are NOT configured in worktree"
  echo "Full git config:"
  git config --list --show-origin
  exit 1
fi

# Verify fetch works in the worktree
echo "Fetching in worktree..."
git fetch origin

echo "Worktree credentials test passed!"
