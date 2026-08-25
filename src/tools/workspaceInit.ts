import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { workspaceRoot, resolveInWorkspace } from "../security/sandbox.js";

export const workspaceInitSchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/, "alphanumeric, dash, underscore only"),
  sourceDir: z.string().optional().describe("Local directory to copy .tf files from. Omit to just create an empty workspace."),
});

export async function tf_workspace_init(input: z.infer<typeof workspaceInitSchema>) {
  const root = workspaceRoot(input.workspaceId);
  fs.mkdirSync(root, { recursive: true });

  if (input.sourceDir) {
    copyTfFiles(path.resolve(input.sourceDir), root);
  }

  return { workspaceId: input.workspaceId, workdir: root };
}

function copyTfFiles(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    throw new Error(`sourceDir does not exist or is not a directory: ${srcDir}`);
  }
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === ".terraform" || entry.name === "terraform.tfstate" || entry.name.endsWith(".tfstate")) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTfFiles(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

export const writeFileSchema = z.object({
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  relativePath: z.string(),
  content: z.string(),
});

export async function tf_write_file(input: z.infer<typeof writeFileSchema>) {
  const target = resolveInWorkspace(input.workspaceId, input.relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, input.content, "utf8");
  return { path: input.relativePath, bytesWritten: Buffer.byteLength(input.content, "utf8") };
}
