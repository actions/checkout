#!/bin/bash

if [ ! -f "./basic/basic-file.txt" ]; then
    echo "Expected basic file does not exist"
    exit 1
fi

echo hello >> ./basic/basic-file.txt
echo hello >> ./basic/new-file.txt
git -C ./basic status