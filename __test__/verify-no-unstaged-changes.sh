#!/bin/bash

if [[ "$(git status --porcelain)" != "" ]]; then
    echo ----------------------------------------
    echo git status
    echo ----------------------------------------
    git status
    echo ----------------------------------------
    echo git diff
    echo ----------------------------------------
    git diff
    echo ----------------------------------------
    echo Troubleshooting
    echo ----------------------------------------
    echo "::error::Unstaged changes detected. Locally try running: git clean -ffdx && npm ci && npm run format && npm run build"
    exit 1
fi
