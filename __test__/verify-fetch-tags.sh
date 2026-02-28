#!/bin/sh

# Verify tags were fetched
TAG_COUNT=$(git -C ./fetch-tags-test tag | wc -l)
if [ "$TAG_COUNT" -eq 0 ]; then
    echo "Expected tags to be fetched, but found none"
    exit 1
fi
echo "Found $TAG_COUNT tags"
