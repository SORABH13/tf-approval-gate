# TF Approval Gate

An MCP server that lets AI coding agents (Claude Code, Cursor, etc.) plan,
policy-check, and cost-estimate Terraform changes -- but makes it
**structurally impossible** for the agent to run `terraform apply` without a
real human clicking Approve in Slack first.

## Why

AI agents can now write and run Terraform directly against real cloud
accounts. An agent that can `terraform apply` on its own can silently
destroy or misconfigure production infrastructure with no human in the loop.
TF Approval Gate closes that gap: every apply requires a signed, single-use
token that only a real human's Slack click (or, in dev mode, a real human at
a terminal) can mint. The agent's own claim that "the human approved" is
never trusted -- the server re-verifies everything itself.

## How it works

1. Agent edits `.tf` files, then calls `tf_propose_change` -- runs
   `terraform plan`, Checkov (+ OPA if configured), and Infracost (if
   configured), and returns one bundled proposal with a
   safe/needs_review/blocked recommendation.
2. Agent calls `tf_request_approval` -- posts the diff + policy findings +
   cost to Slack with Approve/Reject buttons (or prompts on the server's
   terminal in `APPROVAL_MODE=cli`). Refuses to post at all if policy
   findings are blocking.
3. Agent polls `tf_check_approval_status`.
4. A human clicks Approve → the server verifies the click came from an
   allow-listed Slack user and mints a signed, single-use token bound to
   that exact plan's checksum.
5. Agent calls `tf_apply` with the token. The server re-verifies signature,
   expiry, single-use status, the plan's binary checksum, and checks for
   cloud-side drift -- only then does it run `terraform apply`.

See [docs/architecture.md](docs/architecture.md) and
[docs/security-model.md](docs/security-model.md) for the full design and
threat model.

## Quick start (local, no Slack setup needed)

```bash
git clone https://github.com/SORABH13/tf-approval-gate.git
cd tf-approval-gate
npm install
npm run build
npm run check-binaries   # confirms terraform + checkov are on PATH
```

Requires [Terraform](https://developer.hashicorp.com/terraform/install) and
[Checkov](https://www.checkov.io/2.Basics/Installing%20Checkov.html) on
`PATH`. OPA/Conftest and Infracost are optional (features soft-skip if
missing). Or skip installing anything and use the
[Docker image](#docker--devcontainer) below, which bundles all three.

Run it in dev mode (`APPROVAL_MODE=cli` prints the diff to the server's
terminal and waits for a y/n instead of posting to Slack -- good for a first
local test, weaker guarantee than Slack, see
[docs/security-model.md](docs/security-model.md)):

```bash
APPROVAL_MODE=cli TF_APPROVAL_GATE_SECRET=$(openssl rand -hex 32) npm start
```

Then add it as an MCP server in Claude Code (or any MCP client):

```json
{
  "mcpServers": {
    "tf-approval-gate": {
      "command": "node",
      "args": ["/absolute/path/to/tf-approval-gate/dist/index.js"],
      "env": {
        "APPROVAL_MODE": "cli",
        "TF_APPROVAL_GATE_SECRET": "<same secret as above>"
      }
    }
  }
}
```

Point your agent at `examples/local-demo` (uses the `null`/`random`
providers, no cloud credentials required) and ask it to run
`tf_workspace_init` → `tf_propose_change` → `tf_request_approval` →
`tf_apply`.

## Docker / devcontainer

`docker build` produces an image with Node, Terraform, Checkov, and
Conftest (OPA) preinstalled -- no host setup beyond Docker itself.

```bash
docker build -t tf-approval-gate .
docker run --rm -it \
  -e APPROVAL_MODE=cli \
  -e TF_APPROVAL_GATE_SECRET=$(openssl rand -hex 32) \
  -v "$(pwd)/examples/local-demo":/examples/local-demo:ro \
  -v tf-approval-gate-data:/data \
  tf-approval-gate
```

For Slack mode, add `-e SLACK_BOT_TOKEN=... -e SLACK_APP_TOKEN=... -e SLACK_APPROVAL_CHANNEL=... -e SLACK_APPROVER_USER_IDS=...`
and drop `APPROVAL_MODE=cli`. Approval state persists in the `/data` volume
(SQLite-backed, see [docs/architecture.md](docs/architecture.md)).

A [.devcontainer/devcontainer.json](.devcontainer/devcontainer.json) is
also included for VS Code / GitHub Codespaces -- open the repo in a
container and `terraform`/`checkov`/`conftest` are ready immediately.

## Slack setup (production mode)

1. Create a Slack app from [examples/slack-app-manifest.yml](examples/slack-app-manifest.yml).
2. Enable Socket Mode, generate an app-level token (`xapp-...`).
3. Install the app to your workspace, copy the bot token (`xoxb-...`).
4. Set `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_APPROVAL_CHANNEL`, and
   `SLACK_APPROVER_USER_IDS` (comma-separated Slack user IDs allowed to
   click Approve/Reject) -- see [.env.example](.env.example).
5. Run with `APPROVAL_MODE=slack` (the default).

Full walkthrough: [docs/slack-setup.md](docs/slack-setup.md).

## Tools

| Tool | Purpose |
|---|---|
| `tf_workspace_init` | Checks out/copies a Terraform project into a sandboxed workdir. |
| `tf_write_file` | Writes `.tf`/`.tfvars` for agents with no native filesystem access. |
| `tf_plan` | `terraform init && plan`, returns a per-resource change summary. |
| `tf_policy_check` | Checkov (+ OPA/Conftest) against the plan, merged into one report. |
| `tf_cost_estimate` | Infracost monthly cost delta (skipped if unconfigured). |
| `tf_propose_change` | Composite: plan + policy + cost in one call. Call this first. |
| `tf_request_approval` | Posts to Slack (or CLI) for human approval. |
| `tf_check_approval_status` | Poll for the signed approval token. |
| `tf_apply` | The only tool that runs `terraform apply`. Requires a valid token. |

Full reference: [docs/tool-reference.md](docs/tool-reference.md).

## License

MIT -- see [LICENSE](LICENSE).
