#!/bin/bash

# Verify .git folder
if [ ! -d "./sparse-checkout-non-cone-mode/.git" ]; then
  echo "Expected ./sparse-checkout-non-cone-mode/.git folder to exist"
  exit 1
fi

# Verify sparse-checkout (non-cone-mode)
cd sparse-checkout-non-cone-mode

ENABLED=$(git config --local --get-all core.sparseCheckout)

if [ "$?" != "0" ]; then
    echo "Failed to verify that sparse-checkout is enabled"
    exit 1
fi

# Check that sparse-checkout is enabled
if [ "$ENABLED" != "true" ]; then
  echo "Expected sparse-checkout to be enabled (is: $ENABLED)"
  exit 1
fi

SPARSE_CHECKOUT_FILE=$(git rev-parse --git-path info/sparse-checkout)

if [ "$?" != "0" ]; then
    echo "Failed to validate sparse-checkout"
    exit 1
fi

# Check that sparse-checkout list is not empty
if [ ! -f "$SPARSE_CHECKOUT_FILE" ]; then
  echo "Expected sparse-checkout file to exist"
  exit 1
fi

# Check that all folders from sparse-checkout exists
for pattern in $(cat "$SPARSE_CHECKOUT_FILE")
do
  if [ ! -d "${pattern#/}" ]; then
    echo "Expected directory '${pattern#/}' to exist"
    exit 1
  fi
done

# Verify that the root directory is not checked out
if [ -f README.md ]; then
  echo "Expected top-level files not to exist"
  exit 1
fi