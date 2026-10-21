import { z } from "zod";

const optionalText = (max = 120) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

const upper = (v: string | null | undefined) => (typeof v === "string" ? v.toUpperCase() : v);

/** Profile and bank fields accepted on party create/update. Empty strings clear a field. */
export const partyProfileSchema = z.object({
  contactPerson: optionalText(),
  whatsappNumber: optionalText(20),
  city: optionalText(),
  category: optionalText(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  panNumber: optionalText(10)
    .transform(upper)
    .refine((v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v), "PAN must look like ABCDE1234F"),
  bankAccountName: optionalText(),
  bankAccountNumber: optionalText(18)
    .transform((v) => (typeof v === "string" ? v.replace(/\s/g, "") : v))
    .refine((v) => !v || /^\d{9,18}$/.test(v), "Account number must be 9 to 18 digits"),
  bankIfsc: optionalText(11)
    .transform(upper)
    .refine((v) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "IFSC must look like HDFC0001234"),
  bankName: optionalText(),
  bankBranch: optionalText(),
  upiId: optionalText(60).refine((v) => !v || /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v), "UPI ID must look like name@bank"),
});

export type PartyProfileInput = z.infer<typeof partyProfileSchema>;

export const PARTY_PROFILE_FIELDS = Object.keys(partyProfileSchema.shape) as (keyof PartyProfileInput)[];

/** Copies only the profile fields that were sent, so PATCH leaves the rest untouched. */
export function pickProfileUpdates(data: PartyProfileInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PARTY_PROFILE_FIELDS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

export function maskAccountNumber(acc: string | null | undefined): string | null {
  if (!acc) return null;
  return acc.length <= 4 ? acc : `•••• ${acc.slice(-4)}`;
}

/** Public profile: everything except the full account number. */
export function publicPartyProfile(p: any) {
  return {
    contactPerson: p.contactPerson ?? null,
    whatsappNumber: p.whatsappNumber ?? null,
    city: p.city ?? null,
    category: p.category ?? null,
    rating: p.rating ?? null,
    panNumber: p.panNumber ?? null,
    bankAccountName: p.bankAccountName ?? null,
    bankAccountMasked: maskAccountNumber(p.bankAccountNumber),
    bankIfsc: p.bankIfsc ?? null,
    bankName: p.bankName ?? null,
    bankBranch: p.bankBranch ?? null,
    upiId: p.upiId ?? null,
    hasBankDetails: Boolean(p.bankAccountNumber || p.upiId),
  };
}
