import { z } from "zod";
import { getApproval } from "../approval/store.js";

export const checkApprovalStatusSchema = z.object({
  approvalId: z.string().uuid(),
});

export async function tf_check_approval_status(input: z.infer<typeof checkApprovalStatusSchema>) {
  const approval = getApproval(input.approvalId);
  if (!approval) return { error: "not_found" };

  const base = { approvalId: approval.id, status: approval.status, expiresAt: approval.expiresAt };
  if (approval.status === "approved") {
    return { ...base, approvalToken: approval.approvalToken };
  }
  return base;
}
