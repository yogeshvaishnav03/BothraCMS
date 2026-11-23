/**
 * Bill & Delivery Challan OCR / NLP Extraction Utility
 * Extracts Challan/Invoice #, Vendor, Material, Quantity, Unit Rate, Total, Vehicle No, Date
 */

export interface ExtractedBillDetails {
  challanNumber?: string;
  vendorId?: string;
  vendorName?: string;
  materialId?: string;
  materialName?: string;
  quantity?: string;
  unitRate?: string;
  totalAmount?: string;
  vehicleNumber?: string;
  date?: string;
  notes?: string;
  rawText?: string;
}

export function matchMaterial(nameOrText: string, materials: any[]): { id: string; name: string } | null {
  if (!nameOrText || !materials || materials.length === 0) return null;
  const cleanTarget = nameOrText.toLowerCase().trim();

  let bestScore = 0;
  let bestMatch: any = null;

  for (const m of materials) {
    let score = 0;
    const mName = (m.name || "").toLowerCase();
    const sku = (m.sku || "").toLowerCase();

    // Exact matches
    if (cleanTarget === mName) score += 50;
    else if (cleanTarget.includes(mName)) score += 30;
    else if (mName.includes(cleanTarget) && cleanTarget.length > 3) score += 20;

    // SKU match
    if (sku && cleanTarget.includes(sku)) score += 40;

    // Token overlap
    const tokens = mName.split(/[\s,()/-]+/).filter((t: string) => t.length > 2);
    for (const tok of tokens) {
      if (cleanTarget.includes(tok)) score += 8;
    }

    if (score > bestScore && score >= 8) {
      bestScore = score;
      bestMatch = m;
    }
  }

  return bestMatch ? { id: bestMatch.id, name: bestMatch.name } : null;
}

export function matchVendor(nameOrText: string, vendors: any[]): { id: string; name: string } | null {
  if (!nameOrText || !vendors || vendors.length === 0) return null;
  const cleanTarget = nameOrText.toLowerCase().trim();

  let bestScore = 0;
  let bestMatch: any = null;

  for (const v of vendors) {
    let score = 0;
    const vName = (v.name || "").toLowerCase();
    const phone = (v.phone || "").replace(/[^0-9]/g, "");

    // Exact match
    if (cleanTarget === vName) score += 50;
    else if (cleanTarget.includes(vName)) score += 30;
    else if (vName.includes(cleanTarget) && cleanTarget.length > 3) score += 20;

    // Phone match
    if (phone && phone.length >= 8 && cleanTarget.includes(phone)) score += 45;

    // Token overlap
    const tokens = vName.split(/[\s,()/-]+/).filter((t: string) => t.length > 2);
    for (const tok of tokens) {
      if (cleanTarget.includes(tok)) score += 8;
    }

    if (score > bestScore && score >= 8) {
      bestScore = score;
      bestMatch = v;
    }
  }

  return bestMatch ? { id: bestMatch.id, name: bestMatch.name } : null;
}

export function parseBillText(
  rawText: string,
  materials: any[] = [],
  vendors: any[] = []
): ExtractedBillDetails {
  const clean = (rawText || "").replace(/\r/g, "");
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  let challanNumber = "";
  let quantity = "";
  let unitRate = "";
  let totalAmount = "";
  let date = "";
  let vehicleNumber = "";
  let detectedVendorName = "";
  let detectedMaterialName = "";

  for (const line of lines) {
    // 1. Challan / Invoice #
    if (!challanNumber && /(?:challan|invoice|bill|bilty|dc|inv|memo|cash memo|gr|g\.r\.)/i.test(line)) {
      const stripped = line
        .replace(/^(?:delivery\s+challan|challan|tax\s+invoice|retail\s+invoice|invoice|bill\s+of\s+supply|bill|dc|inv|bilty|gr|memo)\s*[:#.-]*/i, "")
        .replace(/^(?:no\.?|num\.?|#|number)\s*[:#.-]*/i, "")
        .trim();
      const m = stripped.match(/^([A-Z0-9\/-]{2,25})/i);
      if (m && !/^(date|dated|to|from|for|mr|m\/s)$/i.test(m[1])) {
        challanNumber = m[1];
      }
    }

    // Direct standalone regex match for DC-XXXX or INV-XXXX format
    if (!challanNumber) {
      const directChallan = line.match(/\b((?:DC|INV|CHL|BIL|GR)[-/][0-9A-Z]{2,20})\b/i);
      if (directChallan) {
        challanNumber = directChallan[1];
      }
    }

    // 2. Vehicle No (Indian vehicle pattern, e.g. RJ-19-GA-1234 or RJ19GA1234)
    if (!vehicleNumber) {
      const vehMatch = line.match(/\b([A-Z]{2}\s*[-]?\s*[0-9]{1,2}\s*[-]?\s*[A-Z]{1,3}\s*[-]?\s*[0-9]{4})\b/i);
      if (vehMatch) {
        vehicleNumber = vehMatch[1].replace(/\s+/g, "-").toUpperCase();
      }
    }

    // 3. Date
    if (!date) {
      const dateMatch =
        line.match(/(?:date|dated|dt\.?)[\s:.-]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i) ||
        line.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
      if (dateMatch) {
        date = dateMatch[1];
      }
    }

    // 4. Quantity on line
    if (!quantity) {
      const qm =
        line.match(/(?:qty|quantity|net\s*qty|delivered\s*qty|dispatched\s*qty|supplied\s*qty)[\s:.-]*([0-9]+(?:\.[0-9]+)?)/i) ||
        line.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:bags?|nos?|pcs?|mt|ton|tons|tonne|tonnes|kg|kgs|cft|brass|m3|bundle|sq\.?ft)\b/i);
      if (qm) {
        quantity = qm[1];
      }
    }

    // 5. Unit Rate on line
    if (!unitRate) {
      const rm =
        line.match(/(?:rate|unit\s*rate|price|unit\s*price|@)[\s:.-]*(?:rs\.?|inr|₹)?[\s:.-]*([0-9]+(?:\.[0-9]+)?)/i) ||
        line.match(/(?:rs\.?|inr|₹)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|\s*per\s*)/i);
      if (rm) {
        unitRate = rm[1];
      }
    }

    // 6. Total Amount on line
    if (!totalAmount) {
      const tm = line.match(
        /(?:total\s*amount|total|grand\s*total|net\s*amount|invoice\s*value|gross\s*total)[\s:.-]*(?:rs\.?|inr|₹)?[\s:.-]*([0-9,]+(?:\.[0-9]+)?)/i
      );
      if (tm) {
        totalAmount = tm[1].replace(/,/g, "");
      }
    }
  }

  // Cross-calculate if Rate is missing but Total & Quantity are present
  const numQty = parseFloat(quantity);
  const numTotal = parseFloat(totalAmount);
  let numRate = parseFloat(unitRate);

  if ((!unitRate || isNaN(numRate) || numRate <= 0) && numQty > 0 && numTotal > 0) {
    numRate = Math.round((numTotal / numQty) * 100) / 100;
    unitRate = String(numRate);
  } else if ((!quantity || isNaN(numQty) || numQty <= 0) && numRate > 0 && numTotal > 0) {
    quantity = String(Math.round((numTotal / numRate) * 100) / 100);
  }

  // Match Material against known materials list
  const matchedMat = matchMaterial(clean, materials);
  const materialId = matchedMat ? matchedMat.id : undefined;
  const materialName = matchedMat ? matchedMat.name : detectedMaterialName || undefined;

  // Match Vendor against known vendors list
  // Usually vendor name is in the first 8 lines of the bill
  const topText = lines.slice(0, 8).join("\n");
  const matchedVen = matchVendor(topText || clean, vendors);
  const vendorId = matchedVen ? matchedVen.id : undefined;
  const vendorName = matchedVen ? matchedVen.name : detectedVendorName || undefined;

  // Notes summary
  const noteParts: string[] = [];
  if (challanNumber) noteParts.push(`Challan: ${challanNumber}`);
  if (date) noteParts.push(`Date: ${date}`);
  if (vehicleNumber) noteParts.push(`Vehicle: ${vehicleNumber}`);
  if (totalAmount) noteParts.push(`Bill Total: ₹${totalAmount}`);
  const notes = noteParts.length > 0 ? `Auto-scanned: ${noteParts.join(" • ")}` : "";

  return {
    challanNumber: challanNumber || undefined,
    vendorId,
    vendorName,
    materialId,
    materialName,
    quantity: quantity || undefined,
    unitRate: unitRate || undefined,
    totalAmount: totalAmount || undefined,
    vehicleNumber: vehicleNumber || undefined,
    date: date || undefined,
    notes: notes || undefined,
    rawText: clean,
  };
}
