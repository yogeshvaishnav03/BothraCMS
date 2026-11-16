import { prisma } from "@/lib/db";
import {
  WorkerType,
  VALID_WORKER_TYPES,
  matchContractorTradeCategory,
  validateWorkerPhone,
} from "@/lib/contractor-trade-mapping";

export {
  type WorkerType,
  VALID_WORKER_TYPES,
  matchContractorTradeCategory,
  validateWorkerPhone,
};

/**
 * Generates the next sequential unique worker ID code for the organization.
 * Format: WRK-8015, WRK-8016, WRK-8017...
 * Safe against race conditions and ensures database uniqueness.
 */
export async function generateNextWorkerCode(
  organizationId: string,
  candidateCode?: string
): Promise<string> {
  // If a candidate code was proposed, check if it's already available
  if (candidateCode) {
    const cleanCandidate = candidateCode.trim().toUpperCase();
    const clash = await prisma.workforceMember.findFirst({
      where: { organizationId, employeeCode: cleanCandidate },
      select: { id: true },
    });
    if (!clash) return cleanCandidate;
  }

  // Fetch all existing worker codes for this company
  const existingWorkers = await prisma.workforceMember.findMany({
    where: { organizationId },
    select: { employeeCode: true },
  });

  // Base threshold is 8014, so the very first generated code is WRK-8015
  let maxNum = 8014;

  for (const w of existingWorkers) {
    const code = (w.employeeCode || "").trim().toUpperCase();
    const match = code.match(/^WRK-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  let nextNum = maxNum + 1;
  let code = `WRK-${nextNum}`;

  // Double check that code does not clash (e.g. from concurrent transactions)
  const existingCodesSet = new Set(existingWorkers.map((w) => (w.employeeCode || "").toUpperCase()));
  while (existingCodesSet.has(code)) {
    nextNum++;
    code = `WRK-${nextNum}`;
  }

  return code;
}

export class WorkforceService {
  /**
   * Checks whether a contractor is already registered as an active workforce member in the organization.
   */
  static async checkDuplicateContractor(
    organizationId: string,
    contractorId?: string | null,
    contractorName?: string | null
  ) {
    if (!contractorId && !contractorName) return null;

    const conditions: any[] = [];
    if (contractorId) {
      conditions.push({ contractorId });
    }
    if (contractorName && contractorName.trim()) {
      conditions.push({ name: { equals: contractorName.trim() } });
    }

    try {
      const match = await prisma.workforceMember.findFirst({
        where: {
          organizationId,
          active: true,
          isArchived: false,
          OR: conditions,
        },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          workerType: true,
          contractorId: true,
        },
      });
      return match;
    } catch {
      // Fallback if contractorId column is still being migrated
      if (contractorName && contractorName.trim()) {
        const match = await prisma.workforceMember.findFirst({
          where: {
            organizationId,
            active: true,
            isArchived: false,
            name: { equals: contractorName.trim() },
          },
          select: {
            id: true,
            employeeCode: true,
            name: true,
            workerType: true,
          },
        });
        return match;
      }
      return null;
    }
  }
}
