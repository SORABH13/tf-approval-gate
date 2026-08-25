# Slack setup

TF Approval Gate uses Slack **Socket Mode** (an outbound websocket from the
server to Slack) so a locally-run MCP server doesn't need a public HTTP
endpoint.

1. Go to https://api.slack.com/apps → **Create New App** → **From an app
   manifest**.
2. Select your workspace, paste the contents of
   [examples/slack-app-manifest.yml](../examples/slack-app-manifest.yml),
   create the app.
3. **Socket Mode** (left sidebar) → confirm it's enabled → **Basic
   Information** → **App-Level Tokens** → generate a token with the
   `connections:write` scope. Copy it (`xapp-...`) into `SLACK_APP_TOKEN`.
4. **OAuth & Permissions** → **Install to Workspace** → copy the **Bot User
   OAuth Token** (`xoxb-...`) into `SLACK_BOT_TOKEN`.
5. Invite the bot to the channel you want approvals posted in, and copy
   that channel's ID into `SLACK_APPROVAL_CHANNEL` (right-click the channel
   → View channel details → the ID is at the bottom).
6. Get the Slack user IDs of everyone allowed to approve (profile → More →
   Copy member ID) and set `SLACK_APPROVER_USER_IDS` as a comma-separated
   list. **Anyone can see the approval message; only these users' clicks
   are honored** -- a click from anyone else is logged and ignored.
7. Run the server with `APPROVAL_MODE=slack` (the default) and the four
   Slack env vars set.

If any of `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `SLACK_APPROVAL_CHANNEL`
is missing, the server logs a warning and every `tf_request_approval` call
falls back to the CLI prompt for that run -- it will not silently pretend
to have posted to Slack.
