# Defines the test-ubuntu-git Container Image.
# Consumed by actions/checkout CI/CD validation workflows.

FROM ubuntu:latest

RUN apt update
RUN apt install -y git

LABEL org.opencontainers.image.title="Ubuntu with git"
LABEL org.opencontainers.image.description="Ubuntu image with git pre-installed"
LABEL org.opencontainers.image.documentation="https://github.com/actions/checkout/tree/main/images/test-ubuntu-git.md"
LABEL org.opencontainers.image.licenses=MIT
