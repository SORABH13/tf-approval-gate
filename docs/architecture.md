# Architecture

## End-to-end flow

```
agent edits .tf files
        │
        ▼
 tf_propose_change  ──► terraform plan ──► Checkov + OPA (parallel) ──► Infracost
        │                                                                    │
        ▼                                                                    ▼
   bundled Proposal (markdown + recommendation: safe/needs_review/blocked)
        │
        ▼
 tf_request_approval ──► drift check ──► policy blocking check ──► Slack (or CLI) post
        │
        ▼
 tf_check_approval_status  (polled by the agent)
        │
        ▼
  human clicks Approve in Slack (Socket Mode) ─────┐
                                                    ▼
                                     server verifies Slack signature +
                                     approver allowlist, mints signed
                                     single-use token bound to plan checksum
        │
        ▼
 tf_apply(token) ──► re-verify signature/expiry/single-use/checksum/drift ──► terraform apply
```

## Directory structure

```
src/
  index.ts server.ts config.ts
  tools/        one file per MCP tool, index.ts registers them all
  terraform/    run.ts (execFile wrapper, workdir jail, state-lock handling),
                planParser.ts, allowlist.ts, types.ts
  policy/       checkov.ts, opa.ts, merge.ts
  cost/         infracost.ts
  approval/     store.ts (file-backed), token.ts (HMAC sign/verify), cliApproval.ts
  slack/        client.ts (Socket Mode), blocks.ts, allowlist.ts
  security/     sandbox.ts (path jail), redact.ts, audit.ts, secret.ts
  utils/        logger.ts, exec.ts (allow-listed execFile, bounded timeout/buffer)
policies/
  checkov/custom/     opa/common/  opa/aws/  opa/azure/  opa/gcp/
examples/
  local-demo/         null/random providers -- no cloud creds needed, used for testing
  aws-read-replica/   real-AWS demo matching the "add a read replica" story
test/unit/  test/e2e/
```

## Roadmap

- **v0.1 -- happy path.** ✅ implemented: workspace init/write, plan, Checkov,
  Slack Socket Mode + CLI fallback approval, apply with full token
  verification. File-backed approval store.
- **v0.2 -- dual policy engine.** ✅ implemented: OPA/Conftest with a default
  Rego library and provider-pluggable directories, unified blocking
  threshold.
- **v0.3 -- cost estimation.** ✅ implemented: Infracost wired into
  `tf_propose_change` and the Slack message, soft-fails when unconfigured.
- **v0.4 -- harden.** ✅ implemented: SQLite-backed approval store
  (`src/approval/db.ts`, WASM `sql.js` -- no native compile step, so
  `npx tf-approval-gate` stays a single command on any machine) with atomic
  guarded `UPDATE ... WHERE status = 'pending'/'approved'` transitions
  replacing the v0.1 file-backed JSON store's manual read-modify-write.
  Plan-checksum re-validation against the binary artifact, SERVER_SECRET
  isolation test, state-lock handling, provider/module allowlisting,
  subprocess resource limits, stale-approval invalidation, partial-apply
  result reporting, and replay-attack tests were all already in place from
  earlier milestones.
- **v1.0 -- public release.** ✅ README, docs, CI, MIT license, npm package,
  GitHub repo, Slack app manifest, real-AWS smoke test
  (`examples/aws-s3-demo`), and a Dockerfile + devcontainer with
  Terraform/Checkov/Conftest preinstalled and verified (`docker build`,
  binaries checked, and the MCP tools run end-to-end inside the container
  against `examples/local-demo`) are all done. Still open: a demo GIF for
  the README, and a cold quick-start test with 2-3 people who haven't seen
  the repo before -- that one needs real outside testers, not something
  that can be automated.
