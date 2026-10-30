"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatQuantity, formatDate } from "@/lib/formatters";
import {
  FileText,
  Download,
  Calendar,
  Boxes,
  DollarSign,
  HardHat,
  Filter,
  RotateCcw,
} from "lucide-react";

export default function ReportsPage() {
  const [reportType, setReportType] = useState<"STOCK" | "PAYABLES" | "ATTENDANCE">("STOCK");
  const [materials, setMaterials] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReportsData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/materials").then(async (r) => {
        if (!r.ok) throw new Error(`Materials fetch failed (HTTP ${r.status})`);
        return r.json();
      }),
      fetch("/api/parties").then(async (r) => {
        if (!r.ok) throw new Error(`Parties fetch failed (HTTP ${r.status})`);
        return r.json();
      }),
      fetch("/api/attendance").then(async (r) => {
        if (!r.ok) throw new Error(`Attendance fetch failed (HTTP ${r.status})`);
        return r.json();
      }),
    ])
      .then(([matRes, partyRes, attRes]) => {
        setMaterials(matRes.data || []);
        setParties(partyRes.data || []);
        setAttendance(attRes.data || []);
      })
      .catch((err) => {
        console.error("Authoritative reports load failed:", err);
        setError(err.message || "Failed to load authoritative report datasets");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  const filteredAttendance = attendance.filter((a) => {
    if (startDate && a.workDate < startDate) return false;
    if (endDate && a.workDate > endDate) return false;
    return true;
  });

  const stockColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "sku", label: "SKU", accessor: (m) => m.sku, type: "text" },
      { key: "name", label: "Material Name", accessor: (m) => m.name, type: "text" },
      { key: "category", label: "Category", accessor: (m) => m.category?.name || "General", type: "text" },
      { key: "totalStock", label: "Stock On Hand", accessor: (m) => Number(m.totalStock) || 0, type: "number", align: "right" },
      { key: "minStockQty", label: "Min Threshold", accessor: (m) => Number(m.minStockQty) || 0, type: "number", align: "right" },
      { key: "status", label: "Status", accessor: (m) => (m.isLowStock ? "LOW STOCK" : "ADEQUATE"), type: "text", align: "center" },
    ],
    []
  );

  const excelStock = useExcelTable({
    data: materials,
    columns: stockColumns,
  });

  const payablesColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "name", label: "Party Name", accessor: (p) => p.name, type: "text" },
      { key: "partyType", label: "Type", accessor: (p) => p.partyType, type: "text" },
      { key: "taxIdentifier", label: "GSTIN", accessor: (p) => p.taxIdentifier || "—", type: "text" },
      { key: "totalBilled", label: "Total Billed", accessor: (p) => (Number(p.totalBilled) || 0) / 100, type: "currency", align: "right" },
      { key: "totalPaid", label: "Total Paid", accessor: (p) => (Number(p.totalPaid) || 0) / 100, type: "currency", align: "right" },
      { key: "outstandingBalance", label: "Outstanding Liability", accessor: (p) => (Number(p.outstandingBalance) || 0) / 100, type: "currency", align: "right" },
    ],
    []
  );

  const excelPayables = useExcelTable({
    data: parties,
    columns: payablesColumns,
  });

  const attendanceReportColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "workDate", label: "Date", accessor: (a) => formatDate(a.workDate), type: "date" },
      { key: "worker", label: "Worker / Trade", accessor: (a) => `${a.workforceMember?.name || ""} (${a.workforceMember?.workerType || ""})`, type: "text" },
      { key: "site", label: "Site", accessor: (a) => a.site?.name || "—", type: "text" },
      { key: "checkInAt", label: "Check-In", accessor: (a) => (a.checkInAt ? formatDate(a.checkInAt) : "—"), type: "date" },
      { key: "checkOutAt", label: "Check-Out", accessor: (a) => (a.checkOutAt ? formatDate(a.checkOutAt) : "—"), type: "date" },
      { key: "status", label: "Status", accessor: (a) => a.status || "PRESENT", type: "text", align: "center" },
    ],
    []
  );

  const excelAttendanceReport = useExcelTable({
    data: filteredAttendance,
    columns: attendanceReportColumns,
  });

  const exportStockCSV = () => {
    const headers = ["SKU", "Material Name", "Category", "Unit", "Current Stock", "Min Stock", "Status"];
    const rows = excelStock.filteredData.map((m) => [
      m.sku,
      `"${m.name}"`,
      m.category?.name || "General",
      m.unitCode,
      m.totalStock,
      m.minStockQty,
      m.isLowStock ? "LOW_STOCK" : "OK",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BothraCMS_Stock_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPayablesCSV = () => {
    const headers = ["Party Name", "Type", "GSTIN", "Total Billed (INR)", "Total Paid (INR)", "Outstanding Balance (INR)"];
    const rows = excelPayables.filteredData.map((p) => [
      `"${p.name}"`,
      p.partyType,
      p.taxIdentifier || "—",
      (p.totalBilled / 100).toFixed(2),
      (p.totalPaid / 100).toFixed(2),
      (p.outstandingBalance / 100).toFixed(2),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BothraCMS_Payables_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAttendanceCSV = () => {
    const headers = [
      "Work Date",
      "Worker Name",
      "Employee Code",
      "Trade",
      "Site",
      "Check In Time",
      "Check Out Time",
      "Status",
      "Notes",
    ];
    const rows = excelAttendanceReport.filteredData.map((a) => [
      a.workDate,
      `"${a.workforceMember?.name || ""}"`,
      a.workforceMember?.employeeCode || "",
      a.workforceMember?.workerType || "",
      `"${a.site?.name || ""}"`,
      a.checkInAt ? new Date(a.checkInAt).toISOString() : "",
      a.checkOutAt ? new Date(a.checkOutAt).toISOString() : "",
      a.status,
      `"${a.notes || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BothraCMS_Attendance_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalStockQty = useMemo(
    () => excelStock.filteredData.reduce((acc, m) => acc + (Number(m.totalStock) || 0), 0),
    [excelStock.filteredData]
  );
  const lowStockCount = useMemo(
    () => excelStock.filteredData.filter((m) => m.isLowStock).length,
    [excelStock.filteredData]
  );

  const totalPayablesBilled = useMemo(
    () => excelPayables.filteredData.reduce((acc, p) => acc + (Number(p.totalBilled) || 0), 0) / 100,
    [excelPayables.filteredData]
  );
  const totalPayablesPaid = useMemo(
    () => excelPayables.filteredData.reduce((acc, p) => acc + (Number(p.totalPaid) || 0), 0) / 100,
    [excelPayables.filteredData]
  );
  const totalOutstandingLiability = useMemo(
    () => excelPayables.filteredData.reduce((acc, p) => acc + (Number(p.outstandingBalance) || 0), 0) / 100,
    [excelPayables.filteredData]
  );

  const presentAttendanceCount = useMemo(
    () => excelAttendanceReport.filteredData.filter((a) => a.status === "PRESENT" || a.status === "OVERTIME").length,
    [excelAttendanceReport.filteredData]
  );

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={FileText} title="Reports & Downloads" subtitle="View stock, payables, and attendance summaries, and download Excel/CSV sheets with one click.">

          <div className="flex items-center gap-2">
            {reportType === "STOCK" && (
              <button
                onClick={exportStockCSV}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Export Stock CSV</span>
              </button>
            )}

            {reportType === "PAYABLES" && (
              <button
                onClick={exportPayablesCSV}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Export Payables CSV</span>
              </button>
            )}

            {reportType === "ATTENDANCE" && (
              <button
                onClick={exportAttendanceCSV}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Export Attendance CSV</span>
              </button>
            )}
          </div>
        </PageHeader>

        {/* Date Filter Bar */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-amber-500" />
            <span>Date Range Filter:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800"
              />
            </div>

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-500 px-2 py-1 rounded bg-rose-50"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Report Selectors */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setReportType("STOCK")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              reportType === "STOCK"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Inventory & Stock Valuation</span>
          </button>

          <button
            onClick={() => setReportType("PAYABLES")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              reportType === "PAYABLES"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Payables Aging & Statements</span>
          </button>

          <button
            onClick={() => setReportType("ATTENDANCE")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              reportType === "ATTENDANCE"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <HardHat className="w-4 h-4" />
            <span>Daily Workforce Attendance ({filteredAttendance.length})</span>
          </button>
        </div>

        {/* Report Content */}
        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-800">
            <span>{error}</span>
            <button
              onClick={fetchReportsData}
              className="px-3 py-1 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="h-64 bg-slate-200/60 rounded-xl animate-pulse" />
        ) : reportType === "STOCK" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Materials Tracked</span>
                <div className="text-lg font-black text-slate-900 mt-0.5">{excelStock.filteredData.length} SKUs</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Total Stock Quantity</span>
                <div className="text-lg font-black text-emerald-700 mt-0.5">{totalStockQty.toLocaleString()} Units</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Low Stock Alerts</span>
                <div className="text-lg font-black text-amber-600 mt-0.5">{lowStockCount} Low Items</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelStock}
                columns={stockColumns}
                tableName="stock inventory"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {stockColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelStock}
                          theme="darkHeader"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelStock.filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                          No stock inventory records match the current filters.
                        </td>
                      </tr>
                    ) : (
                      excelStock.filteredData.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-900">
                            {m.sku}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800">{m.name}</td>
                          <td className="py-3.5 px-4 text-slate-600">{m.category?.name || "General"}</td>
                          <td className="py-3.5 px-4 text-right font-black tabular-nums text-slate-900">
                            {formatQuantity(m.totalStock, m.unitCode)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-medium text-slate-500 tabular-nums">
                            {formatQuantity(m.minStockQty, m.unitCode)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {m.isLowStock ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                LOW STOCK
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                ADEQUATE
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : reportType === "PAYABLES" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Total Billed by Parties</span>
                <div className="text-lg font-black text-slate-900 mt-0.5">{formatCurrency(totalPayablesBilled)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Total Settled / Paid</span>
                <div className="text-lg font-black text-emerald-700 mt-0.5">{formatCurrency(totalPayablesPaid)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Outstanding Liability</span>
                <div className="text-lg font-black text-rose-600 mt-0.5">{formatCurrency(totalOutstandingLiability)}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelPayables}
                columns={payablesColumns}
                tableName="payables"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {payablesColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelPayables}
                          theme="darkHeader"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelPayables.filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                          No party payable records match the current filters.
                        </td>
                      </tr>
                    ) : (
                      excelPayables.filteredData.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900">{p.name}</td>
                          <td className="py-3.5 px-4">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {p.partyType}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                            {p.taxIdentifier || "—"}
                          </td>
                          <td className="py-3.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                            {formatCurrency(p.totalBilled)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-medium text-emerald-600 tabular-nums">
                            {formatCurrency(p.totalPaid)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black tabular-nums">
                            <span className={p.outstandingBalance > 0 ? "text-amber-600" : "text-slate-900"}>
                              {formatCurrency(p.outstandingBalance)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {excelPayables.filteredData.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-xs text-slate-900">
                        <td colSpan={3} className="py-3 px-4 text-right">Grand Total:</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(totalPayablesBilled)}</td>
                        <td className="py-3 px-4 text-right text-emerald-700">{formatCurrency(totalPayablesPaid)}</td>
                        <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(totalOutstandingLiability)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Attendance Entries</span>
                <div className="text-lg font-black text-slate-900 mt-0.5">{excelAttendanceReport.filteredData.length} Records</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Present / Overtime</span>
                <div className="text-lg font-black text-emerald-700 mt-0.5">{presentAttendanceCount} Workers</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Active Filter Period</span>
                <div className="text-xs font-bold text-slate-700 mt-1">
                  {startDate || endDate ? `${startDate || "Beginning"} to ${endDate || "Present"}` : "All Records"}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <ExcelTableToolbar
              table={excelAttendanceReport}
              columns={attendanceReportColumns}
              tableName="workforce attendance"
              showSearch={true}
              showExport={true}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {attendanceReportColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelAttendanceReport}
                        theme="darkHeader"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelAttendanceReport.filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        No attendance records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    excelAttendanceReport.filteredData.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                          {formatDate(a.workDate)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{a.workforceMember?.name}</div>
                          <div className="text-xs text-slate-500 font-mono">
                            {a.workforceMember?.workerType} ({a.workforceMember?.employeeCode})
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700">{a.site?.name}</td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                          {formatDate(a.checkInAt)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                          {a.checkOutAt ? formatDate(a.checkOutAt) : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  </Shell>
  );
}
