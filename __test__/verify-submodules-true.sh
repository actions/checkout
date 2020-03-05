#!/bin/bash

if [ ! -f "./submodules-true/regular-file.txt" ]; then
    echo "Expected regular file does not exist"
    exit 1
fi

if [ ! -f "./submodules-true/submodule-level-1/submodule-file.txt" ]; then
    echo "Expected submodule file does not exist"
    exit 1
fi

if [ -f "./submodules-true/submodule-level-1/submodule-level-2/nested-submodule-file.txt" ]; then
    echo "Unexpected nested submodule file exists"
    exit 1
fi

echo "Testing persisted credential"
pushd ./submodules-true/submodule-level-1
git config --local --name-only --get-regexp http.+extraheader && git fetch
if [ "$?" != "0" ]; then
    echo "Failed to validate persisted credential"
    popd
    exit 1
fi
popd
