import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { config } from "../config.js";

// sql.js is a WASM build of SQLite -- deliberately chosen over a native
// binding (e.g. better-sqlite3) so `npx tf-approval-gate` never requires a
// C++ toolchain on the installing machine. It's synchronous once
// initialized, so callers in approval/store.ts don't need to go async.
const SQL = await initSqlJs();

const dbPath = path.join(config.stateDir, "approvals.sqlite3");
fs.mkdirSync(config.stateDir, { recursive: true });

const db: Database = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

db.run(`
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    workspaceId TEXT NOT NULL,
    planChecksum TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    respondedBy TEXT,
    respondedAt INTEGER,
    approvalToken TEXT,
    slackMessageTs TEXT,
    slackChannel TEXT,
    summaryMarkdown TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_approvals_workspace_status ON approvals(workspaceId, status);
`);
persist();

/** Every mutating statement calls this immediately after -- sql.js has no
 * built-in file-backed persistence, so we serialize the whole (small)
 * database back to disk on each write. Approval-store writes are low
 * frequency (one per propose/approve/apply), so this is not a hot path. */
export function persist(): void {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

export function getDb(): Database {
  return db;
}
