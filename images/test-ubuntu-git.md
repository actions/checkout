# `test-ubuntu-git` Container Image

[![Publish test-ubuntu-git Container](https://github.com/actions/checkout/actions/workflows/update-test-ubuntu-git.yml/badge.svg)](https://github.com/actions/checkout/actions/workflows/update-test-ubuntu-git.yml)

## Purpose

`test-ubuntu-git` is a container image hosted on the GitHub Container Registry, `ghcr.io`.  

It is intended primarily for testing the [`actions/checkout` repository](https://github.com/actions/checkout) as part of `actions/checkout`'s CI/CD workflows.

The composition of `test-ubuntu-git` is intentionally minimal.  It is comprised of [git](https://git-scm.com/) installed on top of a [base-level ubuntu image](https://hub.docker.com/_/ubuntu/tags).

# License

`test-ubuntu-git` is released under the [MIT License](/LICENSE).
