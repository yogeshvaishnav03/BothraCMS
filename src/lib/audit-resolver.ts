import { prisma } from "@/lib/db";
import { formatFileSize, formatCurrency, formatDateTime } from "@/lib/formatters";

export interface ResolvedEntityInfo {
  name: string;
  type: string;
  code?: string;
  subtext?: string;
}

export type EntityNameMap = Record<string, ResolvedEntityInfo>;

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function extractUuids(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(UUID_REGEX);
  return matches ? Array.from(new Set(matches.map((m) => m.toLowerCase()))) : [];
}

function parseJsonSafe(jsonStr: string | null | undefined): Record<string, any> | null {
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Format entity type into human-friendly business name
 */
export function formatAuditEntityType(type: string | null | undefined): string {
  if (!type) return "Record";
  const upper = type.toUpperCase().trim();
  const map: Record<string, string> = {
    TASK: "Project Work Task",
    PROJECT: "Construction Project",
    SITE: "Job Site Location",
    MATERIAL: "Material Item",
    PARTY: "Vendor / Contractor",
    PAYMENT: "Payment Voucher",
    BILL: "Bill / Invoice",
    PURCHASE_ORDER: "Purchase Order",
    ORDER: "Purchase Order",
    STOCK_MOVEMENT: "Inventory Movement",
    ATTENDANCE: "Worker Attendance",
    ATTENDANCE_SESSION: "Worker Attendance",
    DAILY_SITE_REPORT: "Daily Site Report",
    DAILY_REPORT: "Daily Site Report",
    WORKFORCE_MEMBER: "Worker Record",
    WORKER: "Worker Record",
    DOCUMENT_FOLDER: "Document Folder",
    DOCUMENT: "Document / File",
    ATTACHMENT: "Document / File",
    ORGANIZATION: "Company Settings",
    USER: "Staff Member",
  };
  return map[upper] || upper.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format document / media category to a friendly name
 */
export function formatAuditCategory(cat: string | null | undefined): string {
  if (!cat) return "General Document";
  const upper = cat.toUpperCase().trim();
  const map: Record<string, string> = {
    SPECIFICATION: "Specification / Report",
    DRAWING: "Drawing / Blueprint",
    INVOICE: "Invoice / Bill Copy",
    CHALLAN: "Delivery Challan",
    PHOTO: "Site Photo",
    RECEIPT: "Payment Receipt",
    REPORT: "Progress Report",
    CONTRACT: "Legal / Work Contract",
    GENERAL: "General Document",
  };
  return map[upper] || upper.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format mime types to human-readable labels
 */
export function formatAuditMimeType(mime: string | null | undefined): string {
  if (!mime) return "File";
  const lower = mime.toLowerCase().trim();
  if (lower === "application/pdf") return "PDF Document (.pdf)";
  if (lower.startsWith("image/jpeg") || lower.startsWith("image/jpg")) return "JPEG Image (.jpg)";
  if (lower.startsWith("image/png")) return "PNG Image (.png)";
  if (lower.startsWith("image/webp")) return "WebP Image (.webp)";
  if (lower.startsWith("image/")) return `Image File (${lower.split("/")[1]?.toUpperCase() || "IMG"})`;
  if (lower.includes("sheet") || lower.includes("excel") || lower.includes("csv")) return "Excel Spreadsheet (.xlsx / .csv)";
  if (lower.includes("word") || lower.includes("document")) return "Word Document (.docx)";
  return lower;
}

/**
 * Maps attribute keys in JSON payloads to clean human labels
 */
export function formatAuditKeyLabel(key: string): string {
  const map: Record<string, string> = {
    projectId: "Project Name",
    siteId: "Site Location",
    taskId: "Task Name",
    entityId: "Linked Item",
    entityType: "Record Category",
    fileId: "File Document",
    originalName: "Original File Name",
    fileName: "File Name",
    diskFileName: "Storage Security",
    sizeBytes: "File Size",
    fileSize: "File Size",
    mimeType: "File Format",
    category: "Document Category",
    uploadedById: "Uploaded By",
    actorUserId: "Changed By",
    userId: "Staff Member",
    createdBy: "Created By",
    partyId: "Vendor / Contractor",
    vendorPartyId: "Vendor / Supplier",
    materialId: "Material Item",
    storeId: "Warehouse / Store",
    workforceMemberId: "Worker Name",
    orderId: "Purchase Order",
    billId: "Bill Invoice",
    paymentId: "Payment Voucher",
    folderId: "Document Folder",
    organizationId: "Company",
    recipientType: "Recipient Type",
    recipientName: "Payee Name",
    payingAccount: "Payment Account",
    referenceNumber: "Reference #",
    orderNumber: "PO Number",
    billNumber: "Bill Number",
    status: "Status",
    priority: "Priority",
    amount: "Amount",
    totalAmount: "Total Amount",
    taxAmount: "GST / Tax",
    quantityDelta: "Quantity Change",
    quantity: "Quantity",
    unitCode: "Unit",
    unitRate: "Unit Rate",
  };
  if (map[key]) return map[key];

  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Resolves all foreign keys and entity IDs in a batch of audit events into proper names.
 */
export async function resolveAuditEntities(
  organizationId: string,
  events: any[]
): Promise<{ events: any[]; nameMap: EntityNameMap }> {
  const nameMap: EntityNameMap = {};
  if (!events || events.length === 0) {
    return { events: [], nameMap };
  }

  // 1. Gather all candidate UUIDs across all events
  const uuidSet = new Set<string>();
  for (const ev of events) {
    if (ev.entityId && UUID_REGEX.test(ev.entityId)) {
      uuidSet.add(ev.entityId.toLowerCase());
    }
    if (ev.actorUserId && UUID_REGEX.test(ev.actorUserId)) {
      uuidSet.add(ev.actorUserId.toLowerCase());
    }
    const beforeUuids = extractUuids(ev.beforeJson);
    const afterUuids = extractUuids(ev.afterJson);
    for (const u of beforeUuids) uuidSet.add(u);
    for (const u of afterUuids) uuidSet.add(u);
  }

  const candidateIds = Array.from(uuidSet);
  if (candidateIds.length === 0) {
    // Enrich display names from inline JSON
    for (const ev of events) {
      enrichSingleEvent(ev, nameMap);
    }
    return { events, nameMap };
  }

  // 2. Parallel queries across all possible models
  const [
    orgRes,
    projectsRes,
    tasksRes,
    sitesRes,
    usersRes,
    partiesRes,
    materialsRes,
    storesRes,
    workersRes,
    attachmentsRes,
    ordersRes,
    billsRes,
    paymentsRes,
    foldersRes,
    reportsRes,
  ] = await Promise.allSettled([
    prisma.organization.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true, code: true },
    }),
    prisma.task.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, title: true, priority: true, project: { select: { name: true } } },
    }),
    prisma.site.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true, code: true },
    }),
    prisma.user.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true, role: true, jobTitle: true },
    }),
    prisma.party.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true, partyType: true },
    }),
    prisma.material.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true, unitCode: true, sku: true },
    }),
    prisma.store.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true },
    }),
    prisma.workforceMember.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true, trade: true },
    }),
    prisma.attachment.findMany({
      where: {
        OR: [{ id: { in: candidateIds } }, { fileId: { in: candidateIds } }],
        organizationId,
      },
      select: { id: true, fileId: true, fileName: true, category: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, orderNumber: true },
    }),
    prisma.bill.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, billNumber: true },
    }),
    prisma.payment.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, referenceNumber: true, recipientName: true },
    }),
    prisma.documentFolder.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, name: true },
    }),
    prisma.dailySiteReport.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, reportDate: true, site: { select: { name: true } } },
    }),
  ]);

  // 3. Populate nameMap from settled results
  if (orgRes.status === "fulfilled" && orgRes.value) {
    for (const org of orgRes.value) {
      nameMap[org.id.toLowerCase()] = { name: org.name, type: "Company" };
    }
  }

  if (projectsRes.status === "fulfilled" && projectsRes.value) {
    for (const p of projectsRes.value) {
      nameMap[p.id.toLowerCase()] = {
        name: p.name,
        type: "Project",
        code: p.code || undefined,
      };
    }
  }

  if (tasksRes.status === "fulfilled" && tasksRes.value) {
    for (const t of tasksRes.value) {
      nameMap[t.id.toLowerCase()] = {
        name: t.title,
        type: "Task",
        subtext: t.project?.name ? `Project: ${t.project.name}` : undefined,
      };
    }
  }

  if (sitesRes.status === "fulfilled" && sitesRes.value) {
    for (const s of sitesRes.value) {
      nameMap[s.id.toLowerCase()] = {
        name: s.name,
        type: "Site Location",
        code: s.code || undefined,
      };
    }
  }

  if (usersRes.status === "fulfilled" && usersRes.value) {
    for (const u of usersRes.value) {
      nameMap[u.id.toLowerCase()] = {
        name: u.name,
        type: "Staff Member",
        subtext: u.jobTitle || u.role?.replace(/_/g, " "),
      };
    }
  }

  if (partiesRes.status === "fulfilled" && partiesRes.value) {
    for (const p of partiesRes.value) {
      nameMap[p.id.toLowerCase()] = {
        name: p.name,
        type: p.partyType === "CONTRACTOR" ? "Contractor" : "Vendor / Supplier",
      };
    }
  }

  if (materialsRes.status === "fulfilled" && materialsRes.value) {
    for (const m of materialsRes.value) {
      nameMap[m.id.toLowerCase()] = {
        name: m.name,
        type: "Material",
        code: m.sku || undefined,
        subtext: m.unitCode || undefined,
      };
    }
  }

  if (storesRes.status === "fulfilled" && storesRes.value) {
    for (const s of storesRes.value) {
      nameMap[s.id.toLowerCase()] = {
        name: s.name,
        type: "Store Location",
      };
    }
  }

  if (workersRes.status === "fulfilled" && workersRes.value) {
    for (const w of workersRes.value) {
      nameMap[w.id.toLowerCase()] = {
        name: w.name,
        type: "Worker",
        subtext: w.trade || undefined,
      };
    }
  }

  if (attachmentsRes.status === "fulfilled" && attachmentsRes.value) {
    for (const att of attachmentsRes.value) {
      const info: ResolvedEntityInfo = {
        name: att.fileName,
        type: "Document / File",
        subtext: formatAuditCategory(att.category),
      };
      if (att.id) nameMap[att.id.toLowerCase()] = info;
      if (att.fileId) nameMap[att.fileId.toLowerCase()] = info;
    }
  }

  if (ordersRes.status === "fulfilled" && ordersRes.value) {
    for (const o of ordersRes.value) {
      nameMap[o.id.toLowerCase()] = {
        name: `PO #${o.orderNumber}`,
        type: "Purchase Order",
        code: o.orderNumber,
      };
    }
  }

  if (billsRes.status === "fulfilled" && billsRes.value) {
    for (const b of billsRes.value) {
      nameMap[b.id.toLowerCase()] = {
        name: `Bill #${b.billNumber}`,
        type: "Bill",
        code: b.billNumber,
      };
    }
  }

  if (paymentsRes.status === "fulfilled" && paymentsRes.value) {
    for (const pay of paymentsRes.value) {
      nameMap[pay.id.toLowerCase()] = {
        name: `Payment Ref #${pay.referenceNumber}`,
        type: "Payment",
        subtext: pay.recipientName || undefined,
      };
    }
  }

  if (foldersRes.status === "fulfilled" && foldersRes.value) {
    for (const f of foldersRes.value) {
      nameMap[f.id.toLowerCase()] = {
        name: f.name,
        type: "Folder",
      };
    }
  }

  if (reportsRes.status === "fulfilled" && reportsRes.value) {
    for (const r of reportsRes.value) {
      nameMap[r.id.toLowerCase()] = {
        name: `Daily Report: ${r.reportDate}`,
        type: "Daily Site Report",
        subtext: r.site?.name || undefined,
      };
    }
  }

  // 4. Enrich each event with human-readable entityDisplayName
  for (const ev of events) {
    enrichSingleEvent(ev, nameMap);
  }

  return { events, nameMap };
}

function enrichSingleEvent(ev: any, nameMap: EntityNameMap) {
  const normEntityId = ev.entityId?.toLowerCase();
  const directMatch = normEntityId ? nameMap[normEntityId] : null;

  if (directMatch) {
    ev.entityDisplayName = directMatch.name;
    ev.entityTypeLabel = formatAuditEntityType(ev.entityType);
    return;
  }

  // Try parsing afterJson or beforeJson for inline names
  const payload = parseJsonSafe(ev.afterJson) || parseJsonSafe(ev.beforeJson) || {};
  if (payload.originalName) {
    ev.entityDisplayName = payload.originalName;
  } else if (payload.fileName) {
    ev.entityDisplayName = payload.fileName;
  } else if (payload.name) {
    ev.entityDisplayName = payload.name;
  } else if (payload.title) {
    ev.entityDisplayName = payload.title;
  } else if (payload.orderNumber) {
    ev.entityDisplayName = `PO #${payload.orderNumber}`;
  } else if (payload.billNumber) {
    ev.entityDisplayName = `Bill #${payload.billNumber}`;
  } else if (payload.referenceNumber) {
    ev.entityDisplayName = `Ref #${payload.referenceNumber}`;
  } else if (payload.reportDate) {
    ev.entityDisplayName = `Report ${payload.reportDate}`;
  } else if (payload.workDate) {
    ev.entityDisplayName = `Attendance ${payload.workDate}`;
  } else if (payload.entityId && nameMap[payload.entityId.toLowerCase()]) {
    ev.entityDisplayName = nameMap[payload.entityId.toLowerCase()].name;
  } else if (payload.projectId && nameMap[payload.projectId.toLowerCase()]) {
    ev.entityDisplayName = `${formatAuditEntityType(ev.entityType)} (${nameMap[payload.projectId.toLowerCase()].name})`;
  } else {
    ev.entityDisplayName = `${formatAuditEntityType(ev.entityType)}`;
  }

  ev.entityTypeLabel = formatAuditEntityType(ev.entityType);
}
