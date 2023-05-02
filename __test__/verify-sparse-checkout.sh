#!/bin/bash

# Verify .git folder
if [ ! -d "./sparse-checkout/.git" ]; then
  echo "Expected ./sparse-checkout/.git folder to exist"
  exit 1
fi

# Verify sparse-checkout
cd sparse-checkout

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

# Check that all folders and its childrens has been fetched correctly
checkSparse __test__
checkSparse .github
checkSparse dist

# Check that only sparse-checkout folders has been fetched
for pattern in $(git ls-tree --name-only HEAD)
do
  if [ -d "$pattern" ]; then
    if [[ "$pattern" != "__test__" && "$pattern" != ".github" && "$pattern" != "dist" ]]; then
      echo "Expected directory '$pattern' to not exist"
      exit 1
    fi
  fi
done