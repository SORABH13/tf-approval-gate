# Contributing

Thanks for considering a contribution to TF Approval Gate.

## Setup

```bash
npm install
npm run check-binaries   # confirms terraform + checkov are on PATH
npm run build
npm test
```

## Guidelines

- All subprocess calls must go through `src/utils/exec.ts` (allow-listed
  binaries, `execFile` only -- never a shell string, never `shell: true`).
- Anything that returns tool output to the LLM must pass through
  `src/security/redact.ts` first.
- `TF_APPROVAL_GATE_SECRET` must never be logged, returned in a tool
  response, or forwarded to a subprocess's environment. If you touch
  `src/approval/token.ts` or `src/security/secret.ts`, re-run
  `test/unit/secretIsolation.test.ts`.
- New MCP tools go in `src/tools/`, one file per tool, registered in
  `src/tools/index.ts`.
- Add a unit test for any new policy-merging, token, or plan-parsing logic
  under `test/unit/`.

## Pull requests

1. Fork, branch, make your change.
2. `npm test` and `npm run typecheck` must pass.
3. Open a PR describing the change and why.
