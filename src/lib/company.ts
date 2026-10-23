import { prisma } from "@/lib/db";

/** Name, address, phone, GSTIN and TAN from Settings, for receipts, letters and GST. */
export async function companyProfile(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, settingsJson: true } });
  let settings: any = {};
  try {
    settings = org?.settingsJson ? JSON.parse(org.settingsJson) : {};
  } catch {
    settings = {};
  }
  return {
    name: org?.name || "",
    address: settings.companyAddress || null,
    phone: settings.phone || null,
    gstin: settings.taxId || null,
    tan: settings.tan || null,
    /** Turnover last year over ₹10 crore, so 194Q applies to goods suppliers. */
    buyer194Q: !!settings.tds194Q,
    tdsSignatory: settings.tdsSignatory || null,
    tdsSignatoryDesignation: settings.tdsSignatoryDesignation || null,
  };
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

export function isGstin(v: string | null | undefined): v is string {
  return !!v && GSTIN.test(v.trim().toUpperCase());
}

/** The two-digit state code at the start of a GSTIN (08 = Rajasthan). */
export function gstStateCode(v: string | null | undefined): string | null {
  return isGstin(v) ? v.trim().slice(0, 2) : null;
}

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const TAN = /^[A-Z]{4}\d{5}[A-Z]$/;

export function isPan(v: string | null | undefined): v is string {
  return !!v && PAN.test(v.trim().toUpperCase());
}

export function isTan(v: string | null | undefined): v is string {
  return !!v && TAN.test(v.trim().toUpperCase());
}
