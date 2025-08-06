#!/bin/bash

if [ ! -f "./main_path_test/basic-file.txt" ]; then
    echo "Expected file does not exist"
    exit 1
fi
