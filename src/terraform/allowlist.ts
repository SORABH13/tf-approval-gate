import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export class DisallowedProviderError extends Error {
  constructor(public readonly providers: string[]) {
    super(`Provider(s) not on allowlist: ${providers.join(", ")}`);
    this.name = "DisallowedProviderError";
  }
}

export class DisallowedModuleSourceError extends Error {
  constructor(public readonly sources: string[]) {
    super(`Module source(s) not on allowlist: ${sources.join(", ")}`);
    this.name = "DisallowedModuleSourceError";
  }
}

const PROVIDER_SOURCE_RE = /source\s*=\s*"([^"]+)"/g;
const MODULE_SOURCE_RE = /module\s+"[^"]+"\s*{[^}]*?source\s*=\s*"([^"]+)"/gs;

/**
 * Scans every .tf file in the workspace for required_providers sources and
 * module sources, and throws before `terraform init` runs if anything isn't
 * on the configured allowlist. No-op (allow everything) when an allowlist
 * env var is left empty -- opt-in hardening, not a silent default.
 */
export function enforceAllowlists(workspaceRoot: string): void {
  const tfFiles = walkTfFiles(workspaceRoot);
  const disallowedProviders = new Set<string>();
  const disallowedModules = new Set<string>();

  for (const file of tfFiles) {
    const content = fs.readFileSync(file, "utf8");

    if (config.allowedProviders.length > 0 && /required_providers\s*{/.test(content)) {
      for (const m of content.matchAll(PROVIDER_SOURCE_RE)) {
        const source = m[1];
        if (!config.allowedProviders.some((allowed) => source === allowed || source.endsWith(`/${allowed}`))) {
          disallowedProviders.add(source);
        }
      }
    }

    if (config.allowedModuleSources.length > 0) {
      for (const m of content.matchAll(MODULE_SOURCE_RE)) {
        const source = m[1];
        if (!config.allowedModuleSources.some((allowed) => source.startsWith(allowed))) {
          disallowedModules.add(source);
        }
      }
    }
  }

  if (disallowedProviders.size > 0) throw new DisallowedProviderError([...disallowedProviders]);
  if (disallowedModules.size > 0) throw new DisallowedModuleSourceError([...disallowedModules]);
}

function walkTfFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".terraform") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith(".tf")) out.push(full);
    }
  }
  return out;
}
