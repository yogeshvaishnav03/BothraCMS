"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Warehouse,
  Tag,
  PackageCheck,
  Building2,
} from "lucide-react";

export interface ProcurementTabItem {
  id: "materials" | "storage" | "pricing" | "requests" | "parties";
  label: string;
  shortLabel?: string;
  href: string;
  icon: React.ElementType;
  description: string;
}

export const MATERIAL_PROCUREMENT_TABS: ProcurementTabItem[] = [
  {
    id: "materials",
    label: "Materials & Stock",
    shortLabel: "Stock",
    href: "/materials",
    icon: Boxes,
    description: "Site inventory balances, inward/outward registers, and stock adjustments",
  },
  {
    id: "storage",
    label: "Material Storage",
    shortLabel: "Storage",
    href: "/material-storage",
    icon: Warehouse,
    description: "Warehouses, godowns, contractor issues, and returns",
  },
  {
    id: "pricing",
    label: "Material Pricing",
    shortLabel: "Pricing",
    href: "/material-pricing",
    icon: Tag,
    description: "Vendor quotations, market rates, and price comparison sheets",
  },
  {
    id: "requests",
    label: "Material Order History",
    shortLabel: "Order History",
    href: "/material-requests",
    icon: PackageCheck,
    description: "Material requests, purchase orders, delivery challans, and bills",
  },
  {
    id: "parties",
    label: "Vendors & Contractors",
    shortLabel: "Vendors",
    href: "/parties",
    icon: Building2,
    description: "Registered suppliers, subcontracting agencies, and accounts",
  },
];

export default function MaterialProcurementNav({
  activeTab,
}: {
  activeTab?: "materials" | "storage" | "pricing" | "requests" | "parties";
}) {
  const pathname = usePathname();

  const currentTab =
    activeTab ||
    (pathname?.startsWith("/materials")
      ? "materials"
      : pathname?.startsWith("/material-storage")
      ? "storage"
      : pathname?.startsWith("/material-pricing")
      ? "pricing"
      : pathname?.startsWith("/material-requests")
      ? "requests"
      : pathname?.startsWith("/parties")
      ? "parties"
      : "materials");

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-1.5 sm:p-2 shadow-xs mb-5">
      <div className="flex items-center justify-between gap-1 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 sm:gap-1.5 w-full">
          {MATERIAL_PROCUREMENT_TABS.map((tab) => {
            const isActive = currentTab === tab.id;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`flex-1 min-w-max px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 group ${
                  isActive
                    ? "bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-600/20 font-extrabold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                }`}
                title={tab.description}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? "text-slate-950" : "text-amber-600/80 group-hover:text-amber-700"
                  }`}
                />
                <span className="hidden lg:inline">{tab.label}</span>
                <span className="lg:hidden">{tab.shortLabel || tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
