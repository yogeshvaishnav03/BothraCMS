import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { matchMaterial, matchVendor, parseBillText } from "@/lib/bill-ocr";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) {
      return jsonError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawOcrText = formData.get("ocrText") as string | null;

    // Fetch active materials and vendor parties for matching
    const [materials, vendors] = await Promise.all([
      prisma.material.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true, sku: true, unitCode: true, unitPrice: true },
      }),
      prisma.party.findMany({
        where: {
          organizationId: user.organizationId,
          partyType: { in: ["VENDOR", "BOTH"] },
        },
        select: { id: true, name: true, phone: true, category: true },
      }),
    ]);

    // If client already performed OCR and sent raw text, parse it directly
    if (rawOcrText && rawOcrText.trim()) {
      const parsed = parseBillText(rawOcrText, materials, vendors);
      return jsonSuccess({
        method: "client-ocr",
        data: parsed,
      });
    }

    if (!file) {
      return jsonError("No file or OCR text provided", "BAD_REQUEST", 400);
    }

    // Check for Gemini API Key in environment or organization settings
    let geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!geminiKey) {
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { settingsJson: true },
      });
      if (org?.settingsJson) {
        try {
          const parsedSettings = JSON.parse(org.settingsJson);
          geminiKey = parsedSettings.geminiApiKey || parsedSettings.googleApiKey || "";
        } catch {}
      }
    }

    // If no Gemini API key is configured, tell client to run Tesseract client OCR
    if (!geminiKey) {
      return jsonSuccess({
        ocrAvailable: false,
        useClientOcr: true,
        message: "No server AI key configured. Use client-side OCR.",
      });
    }

    // Process with Gemini Multimodal Vision
    const bytes = await file.arrayBuffer();
    const base64Data = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const prompt = `You are an expert construction bill and delivery challan scanner in India.
Analyze this delivery challan / invoice / bill photo and extract the goods receipt details.
Available materials in system: ${JSON.stringify(materials.map((m) => ({ id: m.id, name: m.name, sku: m.sku })))}
Available vendors in system: ${JSON.stringify(vendors.map((v) => ({ id: v.id, name: v.name })))}

Return ONLY a strict valid JSON object in this format (no markdown, no backticks):
{
  "challanNumber": "delivery challan or invoice number if found, e.g. DC-9901",
  "vendorName": "name of vendor or supplier business",
  "vendorId": "matched vendor id from available vendors list if applicable or null",
  "materialName": "description of material, e.g. Jindal cement OPC 43",
  "materialId": "matched material id from available materials list if applicable or null",
  "quantity": 50,
  "unitRate": 270,
  "totalAmount": 13500,
  "vehicleNumber": "truck or vehicle number, e.g. RJ-19-GA-1234",
  "date": "DD/MM/YYYY",
  "notes": "any specific batch number or notes"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("Gemini vision API error:", errText);
      return jsonSuccess({
        ocrAvailable: false,
        useClientOcr: true,
        message: "Gemini vision call failed, falling back to client OCR.",
      });
    }

    const json = await response.json();
    const rawContent = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      return jsonSuccess({
        ocrAvailable: false,
        useClientOcr: true,
      });
    }

    const cleanJsonStr = rawContent.replace(/^```json/i, "").replace(/```$/i, "").trim();
    const aiData = JSON.parse(cleanJsonStr);

    // Re-verify material match if AI didn't provide valid ID
    let finalMaterialId = aiData.materialId;
    if (!finalMaterialId && aiData.materialName) {
      const match = matchMaterial(aiData.materialName, materials);
      if (match) finalMaterialId = match.id;
    }

    // Re-verify vendor match
    let finalVendorId = aiData.vendorId;
    if (!finalVendorId && aiData.vendorName) {
      const match = matchVendor(aiData.vendorName, vendors);
      if (match) finalVendorId = match.id;
    }

    const noteParts: string[] = [];
    if (aiData.challanNumber) noteParts.push(`Challan: ${aiData.challanNumber}`);
    if (aiData.date) noteParts.push(`Date: ${aiData.date}`);
    if (aiData.vehicleNumber) noteParts.push(`Vehicle: ${aiData.vehicleNumber}`);
    if (aiData.totalAmount) noteParts.push(`Total: ₹${aiData.totalAmount}`);
    if (aiData.notes) noteParts.push(aiData.notes);

    return jsonSuccess({
      method: "gemini-vision",
      data: {
        challanNumber: aiData.challanNumber ? String(aiData.challanNumber) : undefined,
        materialId: finalMaterialId || undefined,
        materialName: aiData.materialName || undefined,
        vendorId: finalVendorId || undefined,
        vendorName: aiData.vendorName || undefined,
        quantity: aiData.quantity ? String(aiData.quantity) : undefined,
        unitRate: aiData.unitRate ? String(aiData.unitRate) : undefined,
        totalAmount: aiData.totalAmount ? String(aiData.totalAmount) : undefined,
        vehicleNumber: aiData.vehicleNumber || undefined,
        date: aiData.date || undefined,
        notes: noteParts.length > 0 ? `Auto-scanned: ${noteParts.join(" • ")}` : undefined,
      },
    });
  } catch (error: any) {
    console.error("Error scanning bill:", error);
    return jsonSuccess({
      ocrAvailable: false,
      useClientOcr: true,
      message: error.message || "Failed to process bill image",
    });
  }
}
