# Security policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email **sorabh.yogi06@gmail.com** with a description of the issue, steps to
reproduce, and its impact. You should get an acknowledgment within 5
business days. Please allow time to investigate and release a fix before
any public disclosure.

## Scope

In scope: the MCP server itself (`src/`), the approval token/store logic,
the Slack integration, and the sandboxing/redaction layers.

Out of scope: vulnerabilities in Terraform, Checkov, OPA/Conftest,
Infracost, or Slack themselves -- report those upstream. See
[docs/security-model.md](docs/security-model.md) for the full threat model,
including explicit non-goals.

## Supported versions

Pre-1.0: only the latest release on `main` is supported.
