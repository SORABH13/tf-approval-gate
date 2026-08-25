import { main } from "./server.js";

main().catch((err) => {
  process.stderr.write(`[tf-approval-gate] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
