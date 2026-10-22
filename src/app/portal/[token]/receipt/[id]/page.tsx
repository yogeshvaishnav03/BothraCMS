import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SalesService } from "@/services/sales-service";
import { ReceiptDocument } from "@/components/sales/SalesDocuments";
import { PrintButton } from "@/components/sales/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment receipt", robots: { index: false, follow: false } };

export default async function PortalReceipt({ params }: { params: { token: string; id: string } }) {
  const receipt = await SalesService.portalReceipt(params.token, params.id);
  if (!receipt) notFound();
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between px-4 print:hidden">
        <Link href={`/portal/${params.token}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-2xl px-4 print:max-w-none print:px-0">
        <ReceiptDocument receipt={receipt} />
      </div>
    </div>
  );
}
