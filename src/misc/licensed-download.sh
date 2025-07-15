#!/bin/bash

set -e

if [ ! -f _temp/licensed-3.6.0.done ]; then
  echo 'Clearing temp'
  rm -rf _temp/licensed-3.6.0 || true

  echo 'Downloading licensed'
  mkdir -p _temp/licensed-3.6.0
  pushd _temp/licensed-3.6.0
  if [[ "$OSTYPE" == "darwin"* ]]; then
    curl -Lfs -o licensed.tar.gz https://github.com/github/licensed/releases/download/3.6.0/licensed-3.6.0-darwin-x64.tar.gz
  else
    curl -Lfs -o licensed.tar.gz https://github.com/github/licensed/releases/download/3.6.0/licensed-3.6.0-linux-x64.tar.gz
  fi

  echo 'Extracting licenesed'
  tar -xzf licensed.tar.gz
  popd
  touch _temp/licensed-3.6.0.done
else
  echo 'Licensed already downloaded'
fi
