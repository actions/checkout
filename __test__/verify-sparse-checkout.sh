#!/bin/bash

## REMOVE THIS
exit 0
## REMOVE THIS

if [ ! -f "./sparse-checkout/root.txt" ]; then
  echo "Expected file 'root.txt' to exist"
  exit 1
fi

if [ -d "./sparse-checkout/dir1" ]; then
  echo "Expected directory 'dir1' to not exist"
  exit 1
fi

if [ ! -d "./sparse-checkout/dir2" ]; then
  echo "Expected directory 'dir2' to exist"
  exit 1
fi

if [ ! -d "./sparse-checkout/dir3" ]; then
  echo "Expected directory 'dir3' to exist"
  exit 1
fi
