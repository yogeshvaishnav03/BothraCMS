import { z } from "zod";

/** A checklist an admin or project manager writes for their own site. */
export const checklistSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["QUALITY", "SAFETY"]),
  items: z.array(z.string().max(200)).min(1).max(60),
  replacesKey: z.string().max(40).nullable().optional(),
});
