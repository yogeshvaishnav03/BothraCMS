import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { channels, indianMobile, MESSAGING_DEFAULTS, messagingSettings, publicSettings } from "@/lib/messaging";

export const dynamic = "force-dynamic";

/** Settings → Messages: WhatsApp and SMS set-up, and the log of what was sent. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const [settings, log] = await Promise.all([
      messagingSettings(user.organizationId),
      prisma.messageLog.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    // A message covering several instalments is logged once per instalment; show it once.
    const shown = log.filter((m, n) => !(n > 0 && log[n - 1].to === m.to && log[n - 1].kind === m.kind && log[n - 1].text === m.text));
    // Staff who cannot get WhatsApp alerts until a mobile number is on their profile.
    const staff = await prisma.user.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, select: { phone: true } });
    const staffNoPhone = staff.filter((u) => !indianMobile(u.phone)).length;
    return jsonSuccess({ settings: publicSettings(settings), log: shown, cronReady: !!process.env.CRON_SECRET, staffCount: staff.length, staffNoPhone });
  } catch (error) {
    return handleApiError(error);
  }
}

const text = (max = 200) => z.string().trim().max(max);
const schema = z.object({
  testMode: z.boolean().optional(),
  waPhoneNumberId: z.string().trim().regex(/^\d*$/, "The phone number ID is digits only (from Meta's WhatsApp set-up page)").max(30).optional(),
  // Secrets: left out = keep, "" = remove.
  waToken: text(600).optional(),
  waLanguage: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Language code like en or en_US").optional(),
  waOtpTemplate: text(100).optional(),
  waDemandTemplate: text(100).optional(),
  waReminderTemplate: text(100).optional(),
  smsAuthKey: text(100).optional(),
  smsOtpTemplateId: text(100).optional(),
  autoDemands: z.boolean().optional(),
  remindBeforeDays: z.number().int().min(0).max(15).optional(),
  remindEveryDays: z.number().int().min(1).max(30).optional(),
  maxOverdueReminders: z.number().int().min(0).max(10).optional(),
  buyerSignIn: z.boolean().optional(),
  staffAlerts: z.boolean().optional(),
  waStaffTemplate: text(100).optional(),
  staffApprovals: z.boolean().optional(),
  staffTasks: z.boolean().optional(),
  staffSiteAlerts: z.boolean().optional(),
  siteUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(v), "Web address like https://cms.example.in")
    .optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const input = schema.parse(await req.json());
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { settingsJson: true } });
    let all: any = {};
    try {
      all = org.settingsJson ? JSON.parse(org.settingsJson) : {};
    } catch {
      all = {};
    }
    const before = { ...MESSAGING_DEFAULTS, ...(all.messaging || {}) };
    const next = { ...before, ...input };
    // The buyer's link in messages: this app's own address unless one is typed in.
    if (!next.siteUrl) next.siteUrl = req.nextUrl.origin;
    const can = channels(next);
    if (next.buyerSignIn && !can.otp) return jsonError("Set up WhatsApp (with a sign-in code template) or SMS first, or buyers could not sign in.", "MESSAGING_OFF", 400);
    if (next.autoDemands && !can.demands) return jsonError("Set up WhatsApp with a demand template first.", "MESSAGING_OFF", 400);
    if (next.staffAlerts && !can.staff) return jsonError("Set up WhatsApp with a staff alert template first.", "MESSAGING_OFF", 400);
    await prisma.$transaction([
      prisma.organization.update({ where: { id: user.organizationId }, data: { settingsJson: JSON.stringify({ ...all, messaging: next }) } }),
      prisma.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "MESSAGING_SETTINGS_UPDATED",
          entityType: "ORGANIZATION",
          entityId: user.organizationId,
          // Never the secrets themselves.
          afterJson: JSON.stringify(publicSettings(next)),
        },
      }),
    ]);
    return jsonSuccess({ settings: publicSettings(next) });
  } catch (error) {
    return handleApiError(error);
  }
}
