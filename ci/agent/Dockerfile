# jenkins/inbound-agent, pinned to the current recommended build
# (Debian-based; equivalent to the "latest"/"latest-jdk21" floating tags
# as of 2026-07-18). Debian base is used instead of Alpine because semgrep's
# PyPI wheels target glibc, not musl.
#
# Each scan tool below gets its own RUN layer rather than being merged
# together: bumping one tool's ARG only invalidates and re-downloads that
# tool's layer on rebuild, not every tool's.
#
# The tag is pinned together with its digest. A tag can be moved to a
# different image; a digest cannot, so a rebuild gets the same base bytes
# until this line is changed. Dependabot's docker ecosystem is pointed at
# this directory (.github/dependabot.yml), but this image's tag form may not
# be one it can compare, so do not rely on it: check for a newer tag by hand
# when rebuilding, and change tag and digest together.
FROM jenkins/inbound-agent:3383.vc8881d4b_0e76-1-jdk21@sha256:ca8ce040ee03bb42c7b4440edb84126ddd4a30aeaeb532510b004e9c59b80b18
USER root
# Each downloaded binary has its SHA-256 beside its version and is checked
# before it is installed. These tools decide whether a change may merge, so a
# release asset that has been replaced upstream must fail the image build, not
# become the scanner. When bumping a version, take the new value from the
# release's published checksum file and change both lines together.
ARG GITLEAKS_VERSION=8.30.1
ARG GITLEAKS_SHA256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
ARG SEMGREP_VERSION=1.170.0
ARG ZIZMOR_VERSION=1.27.0
ARG OSV_SCANNER_VERSION=2.4.0
ARG OSV_SCANNER_SHA256=15314940c10d26af9c6649f150b8a47c1262e8fc7e17b1d1029b0e479e8ed8a0
ARG HADOLINT_VERSION=2.14.0
ARG HADOLINT_SHA256=6bf226944684f56c84dd014e8b979d27425c0148f61b3bd99bcc6f39e9dc5a47
ARG SYFT_VERSION=1.48.0
ARG SYFT_SHA256=6cef9a7f37220d9067eaf9cfaaa2fce986e9f320a8d42cbc36658c99af78ea04
# Intentionally unpinned: apt version pinning on Debian is brittle across
# mirror/snapshot lifecycle (a pinned version can vanish from the mirror
# before the next rebuild, breaking the build over a transitive tool
# dependency rather than an actual security concern). git/curl/python3-pip
# are base-layer plumbing, not security-sensitive scan tools — those are
# all pinned individually below by their own ARGs.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/gitleaks.tar.gz \
        "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    && echo "${GITLEAKS_SHA256}  /tmp/gitleaks.tar.gz" > /tmp/gitleaks.sha256 \
    && sha256sum -c /tmp/gitleaks.sha256 \
    && tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks \
    && rm /tmp/gitleaks.tar.gz /tmp/gitleaks.sha256 \
    && gitleaks version
RUN pip3 install --no-cache-dir --break-system-packages "semgrep==${SEMGREP_VERSION}"
# Workflow security auditor
# hadolint ignore=DL3059
RUN pip3 install --no-cache-dir --break-system-packages "zizmor==${ZIZMOR_VERSION}"
# Supply-chain vulnerability scanner (OSV database).
# Note: v2.x release assets are named osv-scanner_linux_amd64 with the
# version only in the tag path (v1.x embedded the version in the filename).
RUN curl -fsSL -o /usr/local/bin/osv-scanner \
        "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64" \
    && echo "${OSV_SCANNER_SHA256}  /usr/local/bin/osv-scanner" > /tmp/osv-scanner.sha256 \
    && sha256sum -c /tmp/osv-scanner.sha256 \
    && rm /tmp/osv-scanner.sha256 \
    && chmod +x /usr/local/bin/osv-scanner \
    && osv-scanner --version
# Dockerfile linter, used against ci/agent/Dockerfile itself.
RUN curl -fsSL -o /usr/local/bin/hadolint \
        "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-linux-x86_64" \
    && echo "${HADOLINT_SHA256}  /usr/local/bin/hadolint" > /tmp/hadolint.sha256 \
    && sha256sum -c /tmp/hadolint.sha256 \
    && rm /tmp/hadolint.sha256 \
    && chmod +x /usr/local/bin/hadolint \
    && hadolint --version
# SBOM generator, run on main to produce sbom.json as a build artifact.
RUN curl -fsSL -o /tmp/syft.tar.gz \
        "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_amd64.tar.gz" \
    && echo "${SYFT_SHA256}  /tmp/syft.tar.gz" > /tmp/syft.sha256 \
    && sha256sum -c /tmp/syft.sha256 \
    && tar -xzf /tmp/syft.tar.gz -C /usr/local/bin syft \
    && rm /tmp/syft.tar.gz /tmp/syft.sha256 \
    && syft version

USER jenkins