#!/bin/bash

# Verify .git folder
if [ ! -d "./sparse-checkout/.git" ]; then
  echo "Expected ./sparse-checkout/.git folder to exist"
  exit 1
fi

# Verify sparse-checkout
cd sparse-checkout

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

# Check that all folders of the sparse checkout exist
for pattern in $SPARSE
do
  if [ ! -d "$pattern" ]; then
    echo "Expected directory '$pattern' to exist"
    exit 1
  fi
done

checkSparse () {
  if [ ! -d "./$1" ]; then
    echo "Expected directory '$1' to exist"
    exit 1
  fi

  for file in $(git ls-tree -r --name-only HEAD $1)
  do
    if [ ! -f "$file" ]; then
      echo "Expected file '$file' to exist"
      exit 1
    fi
  done
}

# Check that all folders and their children have been checked out
checkSparse __test__
checkSparse .github
checkSparse dist

# Check that only sparse-checkout folders have been checked out
for pattern in $(git ls-tree --name-only HEAD)
do
  if [ -d "$pattern" ]; then
    if [[ "$pattern" != "__test__" && "$pattern" != ".github" && "$pattern" != "dist" ]]; then
      echo "Expected directory '$pattern' to not exist"
      exit 1
    fi
  fi
done