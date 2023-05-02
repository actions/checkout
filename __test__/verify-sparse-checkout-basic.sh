#!/bin/bash

SPARSE=$(git sparse-checkout list)

if [ "$?" != "0" ]; then
    echo "Failed to validate sparse-checkout"
    exit 1
fi

# Check that sparse-checkout list is not empty
if [ -z "$SPARSE" ]; then
  echo "Expected sparse-checkout list to not be empty"
  exit 1
fi

# Check that all folders from sparse-checkout exists
for pattern in $(git sparse-checkout list)
do
  if [ ! -d "$pattern" ]; then
    echo "Expected directory '$pattern' to exist"
    exit 1
  fi
done