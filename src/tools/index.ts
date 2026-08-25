import { z } from "zod";
import { tf_workspace_init, workspaceInitSchema, tf_write_file, writeFileSchema } from "./workspaceInit.js";
import { tf_plan, planSchema } from "./plan.js";
import { tf_policy_check, policyCheckSchema } from "./policyCheck.js";
import { tf_cost_estimate, costEstimateSchema } from "./costEstimate.js";
import { tf_propose_change, proposeChangeSchema } from "./proposeChange.js";
import { tf_request_approval, requestApprovalSchema } from "./requestApproval.js";
import { tf_check_approval_status, checkApprovalStatusSchema } from "./checkApprovalStatus.js";
import { tf_apply, applySchema } from "./apply.js";

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  handler: (input: z.infer<S>) => Promise<unknown>;
}

export const tools: ToolDefinition[] = [
  {
    name: "tf_workspace_init",
    description: "Checks out/copies a Terraform project into a sandboxed workdir.",
    schema: workspaceInitSchema,
    handler: tf_workspace_init,
  },
  {
    name: "tf_write_file",
    description: "Writes a .tf/.tfvars file into a sandboxed workspace (for agents with no native filesystem access).",
    schema: writeFileSchema,
    handler: tf_write_file,
  },
  {
    name: "tf_plan",
    description: "Runs terraform init+plan and returns a resource-level change summary.",
    schema: planSchema,
    handler: tf_plan,
  },
  {
    name: "tf_policy_check",
    description: "Runs Checkov (and OPA/Conftest if configured) against the current plan and returns a merged policy report.",
    schema: policyCheckSchema,
    handler: tf_policy_check,
  },
  {
    name: "tf_cost_estimate",
    description: "Runs Infracost against the current plan and returns a monthly cost delta (skipped if INFRACOST_API_KEY is unset).",
    schema: costEstimateSchema,
    handler: tf_cost_estimate,
  },
  {
    name: "tf_propose_change",
    description:
      "Composite tool: runs plan, policy check, and cost estimate together and returns one bundled Proposal with a recommendation (safe/needs_review/blocked). Call this before tf_request_approval.",
    schema: proposeChangeSchema,
    handler: tf_propose_change,
  },
  {
    name: "tf_request_approval",
    description:
      "Sends the current plan for human approval (Slack, or the server's terminal in APPROVAL_MODE=cli). Refuses if policy findings are blocking. Returns an approvalId to poll.",
    schema: requestApprovalSchema,
    handler: tf_request_approval,
  },
  {
    name: "tf_check_approval_status",
    description: "Polls the status of a pending approval. Returns a signed approvalToken once a human approves.",
    schema: checkApprovalStatusSchema,
    handler: tf_check_approval_status,
  },
  {
    name: "tf_apply",
    description:
      "The only tool that runs terraform apply. Requires a valid approvalId + approvalToken minted by a real human approval; verifies signature, expiry, single-use, plan checksum, and drift server-side before applying.",
    schema: applySchema,
    handler: tf_apply,
  },
];
