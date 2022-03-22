#!/bin/bash

set -e

src/misc/licensed-download.sh

echo 'Running: licensed cached'
_temp/licensed-3.3.1/licensed cache