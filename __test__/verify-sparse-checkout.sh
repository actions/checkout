#!/bin/bash

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

# Check that .github and its childrens has been fetched correctly
if [ ! -d "./__test__" ]; then
  echo "Expected directory '__test__' to exist"
  exit 1
fi

for file in $(git ls-tree -r --name-only HEAD __test__)
do
  if [ ! -f "$file" ]; then
    echo "Expected file '$file' to exist"
    exit 1
  fi
done

# Check that .github and its childrens has been fetched correctly
if [ ! -d "./.github" ]; then
  echo "Expected directory '.github' to exist"
  exit 1
fi

for file in $(git ls-tree -r --name-only HEAD .github)
do
  if [ ! -f "$file" ]; then
    echo "Expected file '$file' to exist"
    exit 1
  fi
done

# Check that dist and its childrens has been fetched correctly
if [ ! -d "./dist" ]; then
  echo "Expected directory 'dist' to exist"
  exit 1
fi

for file in $(git ls-tree -r --name-only HEAD dist)
do
  if [ ! -f "$file" ]; then
    echo "Expected file '$file' to exist"
    exit 1
  fi
done