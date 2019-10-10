#!/bin/bash

if [ ! -f "./basic/basic-file.txt" ]; then
    echo "Expected basic file does not exist"
    exit 1
fi

# Verify auth token
cd basic
git fetch