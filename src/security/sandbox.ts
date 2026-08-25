import path from "node:path";
import { config } from "../config.js";

export class WorkspaceEscapeError extends Error {
  constructor(attempted: string) {
    super(`Path escapes the workspace jail: ${attempted}`);
    this.name = "WorkspaceEscapeError";
  }
}

/**
 * Resolves `relativeOrAbsolute` against the workspace root for `workspaceId`
 * and throws if the resolved path falls outside that root (rejects `..`
 * traversal, absolute-path escapes, and symlink-looking tricks at the string
 * level -- callers doing fs work should also avoid following symlinks).
 */
export function resolveInWorkspace(workspaceId: string, relativeOrAbsolute: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
    throw new WorkspaceEscapeError(workspaceId);
  }
  const root = path.resolve(config.workdir, workspaceId);
  const resolved = path.resolve(root, relativeOrAbsolute);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new WorkspaceEscapeError(relativeOrAbsolute);
  }
  return resolved;
}

export function workspaceRoot(workspaceId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
    throw new WorkspaceEscapeError(workspaceId);
  }
  return path.resolve(config.workdir, workspaceId);
}
