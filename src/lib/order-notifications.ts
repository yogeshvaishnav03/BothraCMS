export interface FormatNotificationParams {
  orderNumber: string;
  organizationName: string;
  vendorName: string;
  materialName: string;
  materialSku: string;
  quantity: number;
  unitCode: string;
  unitRate?: number | null;
  totalAmount?: number | null;
  deliveryLocation?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  approvalQuery?: string | null;
  orderedByName: string;
  approvedByName?: string | null;
}

export function resolveDeliveryLocation(order: {
  store?: { name: string; site?: { name: string; address?: string | null } | null } | null;
  site?: { name: string; address?: string | null } | null;
  project?: { name: string; site?: { name: string; address?: string | null } | null } | null;
}): string {
  const site = order.site || order.store?.site || order.project?.site;
  const siteName = site?.name?.trim() || "Main Site";
  const siteAddress = site?.address?.trim() || "";

  let storePart = "";
  if (order.store?.name) {
    let cleanStoreName = order.store.name.trim();
    // Clean up duplicated site prefix in store names (e.g. "PEVA NAGAR - Secondary Store" with site "PEVA NAGAR")
    const prefixRegex = new RegExp(`^${siteName}\\s*[-—–:]\\s*`, "i");
    if (prefixRegex.test(cleanStoreName)) {
      cleanStoreName = cleanStoreName.replace(prefixRegex, "").trim();
    }
    if (cleanStoreName.toLowerCase() !== siteName.toLowerCase()) {
      storePart = cleanStoreName;
    }
  }

  let location = siteName;
  if (storePart) {
    location = `${siteName} — ${storePart}`;
  }

  if (siteAddress) {
    location = `${location}, ${siteAddress}`;
  }

  return location;
}

export function formatNotificationMessage(data: FormatNotificationParams): string {
  const parts = [
    `🏗️ *PURCHASE ORDER: ${data.orderNumber}*`,
    `*${data.organizationName}*`,
    ``,
    `Dear *${data.vendorName}*,`,
    `A new material purchase order has been approved and placed with you for site supply:`,
    ``,
    `📦 *Material:* ${data.materialName} (${data.materialSku})`,
    `🔢 *Quantity:* ${data.quantity} ${data.unitCode}`,
  ];

  if (data.unitRate && data.unitRate > 0) {
    const rateRupees = data.unitRate / 100;
    parts.push(`💰 *Rate:* ₹${rateRupees.toFixed(2)} / ${data.unitCode}`);
  }
  if (data.totalAmount && data.totalAmount > 0) {
    const totalRupees = data.totalAmount / 100;
    parts.push(`💵 *Estimated Total:* ₹${totalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
  }
  if (data.deliveryLocation) {
    parts.push(`📍 *Delivery Location:* ${data.deliveryLocation}`);
  }
  if (data.expectedDeliveryDate) {
    parts.push(`📅 *Expected Delivery:* ${data.expectedDeliveryDate}`);
  }
  if (data.notes && data.notes.trim()) {
    parts.push(`📝 *Instructions / Notes:* ${data.notes.trim()}`);
  }

  parts.push(``);
  parts.push(`👤 *Requested by:* ${data.orderedByName}`);
  if (data.approvedByName) {
    parts.push(`✅ *Approved by:* ${data.approvedByName}`);
  }
  parts.push(`Please confirm order receipt, stock availability, and your dispatch timeline.`);
  parts.push(`Thank you!`);

  return parts.join("\n");
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // If standard 10-digit Indian mobile, prepend country code 91
  const cleanPhone = digits.length === 10 ? `91${digits}` : digits;
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
}

export function buildMailtoUrl(email: string | null | undefined, subject: string, body: string): string | null {
  if (!email || !email.includes("@")) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
