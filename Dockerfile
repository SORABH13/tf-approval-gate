# TF Approval Gate -- runnable image with Terraform, Checkov, and Conftest
# (OPA) preinstalled, so `docker run` is the entire setup: no "now go
# install four CLIs" step blocking first-run. Infracost is optional and not
# baked in (needs a per-user API key anyway) -- tf_cost_estimate soft-skips
# without it.

FROM node:20-slim AS base

ARG TERRAFORM_VERSION=1.9.8
ARG CONFTEST_VERSION=0.56.0
ARG TARGETARCH=amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip ca-certificates python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Terraform
RUN curl -fsSL -o /tmp/terraform.zip \
      "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip \
    && terraform -version

# Conftest (OPA policy runner)
RUN curl -fsSL -o /tmp/conftest.tar.gz \
      "https://github.com/open-policy-agent/conftest/releases/download/v${CONFTEST_VERSION}/conftest_${CONFTEST_VERSION}_Linux_x86_64.tar.gz" \
    && tar -xzf /tmp/conftest.tar.gz -C /usr/local/bin conftest \
    && rm /tmp/conftest.tar.gz \
    && conftest --version

# Checkov (via pip, --break-system-packages needed on Debian's managed Python)
RUN pip3 install --no-cache-dir --break-system-packages checkov \
    && checkov --version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist ./dist
COPY bin ./bin
COPY policies ./policies

ENV TF_APPROVAL_GATE_WORKDIR=/data/workspaces
ENV TF_APPROVAL_GATE_STATE_DIR=/data
VOLUME ["/data"]

ENTRYPOINT ["node", "dist/index.js"]
