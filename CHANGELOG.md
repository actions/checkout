# Changelog

## Unreleased Changes
- N/A

## v1.2.0
- Reverted the breaking behavior change in v1.1.0 that broke custom authentication flows

## v1.1.0 (Not reccomended for use, this functionality will be ported to the 2.0 update)
- Persist `with.token` or `${{ github.token }}` into checkout repository's git config as `http.https://github.com/.extraheader=AUTHORIZATION: basic ***` to better support scripting git

## v1.0.0
- Initial Release of the checkout action