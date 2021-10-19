set -e

if [ ! -f _temp/licensed-3.3.1.done ]; then
  echo 'Clearing temp'
  rm -rf _temp/licensed-3.3.1 || true

  echo 'Downloading licensed'
  mkdir -p _temp/licensed-3.3.1
  pushd _temp/licensed-3.3.1
  curl -Lfs -o licensed.tar.gz https://github.com/github/licensed/releases/download/3.3.1/licensed-3.3.1-darwin-x64.tar.gz

  echo 'Extracting licenesed'
  tar -xzf licensed.tar.gz
  popd
  touch _temp/licensed-3.3.1.done
else
  echo 'Licensed already downloaded'
fi
