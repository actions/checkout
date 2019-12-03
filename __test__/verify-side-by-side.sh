#!/bin/bash

if [ ! -f "./side-by-side-1/side-by-side-test-file-1.txt" ]; then
    echo "Expected file 1 does not exist"
    exit 1
fi

if [ ! -f "./side-by-side-2/side-by-side-test-file-2.txt" ]; then
    echo "Expected file 2 does not exist"
    exit 1
fi
