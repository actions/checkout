#!/bin/bash

if [ ! -f "./lfs/regular-file.txt" ]; then
    echo "Expected regular file does not exist"
    exit 1
fi

if [ ! -f "./lfs/lfs-file.bin" ]; then
    echo "Expected lfs file does not exist"
    exit 1
fi

if head -n 1 "./lfs/lfs-file.bin" | grep -q "git-lfs.github.com/spec"; then
    echo "Expected lfs file to be materialized, but it is still an LFS pointer"
    exit 1
fi
