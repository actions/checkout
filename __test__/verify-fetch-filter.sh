#!/bin/bash

# Verify .git folder
if [ ! -d "./fetch-filter/.git" ]; then
  echo "Expected ./fetch-filter/.git folder to exist"
  exit 1
fi

# Verify .git/config contains partialclonefilter

CLONE_FILTER=$(git -C fetch-filter config --local --get remote.origin.partialclonefilter)

if [ "$CLONE_FILTER" != "blob:none" ]; then
  echo "Expected ./fetch-filter/.git/config to have 'remote.origin.partialclonefilter' set to 'blob:none'"
  exit 1
fi
