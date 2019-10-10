#!/bin/bash

if [ ! -f "./submodules-not-checked-out/regular-file.txt" ]; then
    echo "Expected regular file does not exist"
    exit 1
fi

if [ -f "./submodules-not-checked-out/submodule-level-1/submodule-file.txt" ]; then
    echo "Unexpected submodule file exists"
    exit 1
fi
