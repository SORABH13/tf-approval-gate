import { describe, it, expect } from "vitest";
import { parsePlanJson, formatChangeSummaryMarkdown } from "../../src/terraform/planParser.js";

const meta = { workspaceId: "ws1", planChecksum: "abc123", planJsonPath: "/tmp/a.json", planBinaryPath: "/tmp/a.bin" };

describe("parsePlanJson", () => {
  it("classifies create/update/delete/no-op", () => {
    const planJson = {
      resource_changes: [
        { address: "a", type: "t", name: "a", provider_name: "aws", change: { actions: ["create"] } },
        { address: "b", type: "t", name: "b", provider_name: "aws", change: { actions: ["update"] } },
        { address: "c", type: "t", name: "c", provider_name: "aws", change: { actions: ["delete"] } },
        { address: "d", type: "t", name: "d", provider_name: "aws", change: { actions: ["no-op"] } },
      ],
    };
    const summary = parsePlanJson(planJson, meta);
    expect(summary.counts).toEqual({ create: 1, update: 1, delete: 1, replace: 0, noop: 1 });
  });

  it("classifies replace (delete+create) as replace and destructive", () => {
    const planJson = {
      resource_changes: [{ address: "r", type: "t", name: "r", provider_name: "aws", change: { actions: ["delete", "create"] } }],
    };
    const summary = parsePlanJson(planJson, meta);
    expect(summary.counts.replace).toBe(1);
    expect(summary.resources[0].isDestructive).toBe(true);
  });

  it("flags any action set containing delete as destructive", () => {
    const planJson = {
      resource_changes: [{ address: "x", type: "t", name: "x", provider_name: "aws", change: { actions: ["delete"] } }],
    };
    const summary = parsePlanJson(planJson, meta);
    expect(summary.resources[0].isDestructive).toBe(true);
  });

  it("handles empty resource_changes", () => {
    const summary = parsePlanJson({ resource_changes: [] }, meta);
    expect(summary.resources).toHaveLength(0);
    expect(formatChangeSummaryMarkdown(summary)).toContain("No changes");
  });
});
