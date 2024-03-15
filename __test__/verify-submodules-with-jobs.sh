#!/bin/bash

if [ ! -f "./submodules-recursive/regular-file.txt" ]; then
    echo "Expected regular file does not exist"
    exit 1
fi

if [ ! -f "./submodules-recursive/submodule-level-1/submodule-file.txt" ]; then
    echo "Expected submodule file does not exist"
    exit 1
fi

if [ ! -f "./submodules-recursive/submodule-level-1/submodule-level-2/nested-submodule-file.txt" ]; then
    echo "Expected nested submodule file does not exists"
    exit 1
fi

echo "Testing fetchJobs exists"
git config --local --get-regexp submodules.fetchJobs | grep 10
if [ "$?" != "0" ]; then
    echo "Failed to validate fetchJobs configuration"
    exit 1
fi

echo "Testing persisted credential"
pushd ./submodules-recursive/submodule-level-1/submodule-level-2
git config --local --name-only --get-regexp http.+extraheader && git fetch
if [ "$?" != "0" ]; then
    echo "Failed to validate persisted credential"
    popd
    exit 1
fi
popd
