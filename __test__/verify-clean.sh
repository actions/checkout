#!/bin/bash

if [[ "$(git -C ./basic status --porcelain)" != "" ]]; then
    echo ----------------------------------------
    echo git status
    echo ----------------------------------------
    git status
    echo ----------------------------------------
    echo git diff
    echo ----------------------------------------
    git diff
    exit 1
fi
