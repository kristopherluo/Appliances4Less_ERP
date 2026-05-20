import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useStore } from "../context/StoreContext";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function InvoiceList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { stores } = useStore();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.get("/invoices/").then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/invoices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const minYear = useMemo(() => {
    if (!invoices.length) return now.getFullYear();
    return Math.min(...invoices.map((inv) => new Date(inv.created_at).getFullYear()));
  }, [invoices]);

  const years = useMemo(() => {
    const max = now.getFullYear();
    const years = [];
    for (let y = minYear; y <= max; y++) years.push(y);
    return years;
  }, [minYear]);

  const filtered = useMemo(() =>
    invoices
      .filter((inv) => !selectedStoreId || inv.store_id === Number(selectedStoreId))
      .filter((inv) => {
        const d = new Date(inv.created_at);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      }),
    [invoices, selectedStoreId, selectedMonth, selectedYear]
  );

  const stats = useMemo(() => {
    const orders = filtered.length;
    const totalRevenue = filtered.reduce((s, inv) => s + Number(inv.total_amount), 0);
    const totalTax = filtered.reduce((s, inv) => s + Number(inv.tax_amount), 0);
    const preTax = totalRevenue - totalTax;
    return { orders, preTax, totalTax, totalRevenue };
  }, [filtered]);

  const fmt = (n) =>
    `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtDate = (s) =>
    new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-xl font-semibold text-gray-800 mr-2">Sales</h2>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/invoices/new")}
          className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded text-sm font-medium"
        >
          + New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Orders", value: stats.orders },
          { label: "Pre-Tax Revenue", value: fmt(stats.preTax) },
          { label: "Total Tax", value: fmt(stats.totalTax) },
          { label: "Total Revenue", value: fmt(stats.totalRevenue) },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className="text-xl font-semibold text-gray-800">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                {["Invoice #", "Date", "Customer", "Items", "Pre-Tax", "Tax", "Total", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No invoices for {MONTHS[selectedMonth]} {selectedYear}
                  </td>
                </tr>
              )}
              {filtered.map((inv) => {
                const preTax = Number(inv.total_amount) - Number(inv.tax_amount);
                const expanded = expandedIds.has(inv.id);
                return [
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-blue-700 font-semibold">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleExpand(inv.id)}
                          className="text-gray-400 hover:text-gray-600 w-4 text-center leading-none select-none"
                          title={expanded ? "Collapse" : "Expand"}
                        >
                          {expanded ? "▾" : "▸"}
                        </button>
                        <button
                          onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, "_blank")}
                          className="hover:underline"
                        >
                          #{String(inv.id).padStart(5, "0")}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(inv.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium">{inv.customer_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{inv.line_items?.length ?? 0}</td>
                    <td className="px-4 py-2.5 text-gray-700">{fmt(preTax)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{fmt(inv.tax_amount)}</td>
                    <td className="px-4 py-2.5 font-semibold text-green-700">{fmt(inv.total_amount)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button
                        onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, "_blank")}
                        className="text-blue-600 hover:underline text-xs mr-3"
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => { if (window.confirm("Delete this invoice?")) deleteMutation.mutate(inv.id); }}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>,
                  expanded && (
                    <tr key={`${inv.id}-items`} className="bg-blue-50/40">
                      <td colSpan={8} className="px-8 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 uppercase tracking-wide border-b border-gray-200">
                              <th className="pb-1 text-left font-semibold pr-4">Description</th>
                              <th className="pb-1 text-left font-semibold pr-4">A/C Code</th>
                              <th className="pb-1 text-left font-semibold pr-4">Model #</th>
                              <th className="pb-1 text-left font-semibold pr-4">Serial #</th>
                              <th className="pb-1 text-right font-semibold pr-4">Qty</th>
                              <th className="pb-1 text-right font-semibold pr-4">Unit Price</th>
                              <th className="pb-1 text-right font-semibold">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(inv.line_items ?? []).map((li) => (
                              <tr key={li.id} className="text-gray-700">
                                <td className="py-1.5 pr-4">{li.description}</td>
                                <td className="py-1.5 pr-4 font-mono text-gray-500">{li.ac_code || "—"}</td>
                                <td className="py-1.5 pr-4 font-mono text-gray-500">{li.model_number || "—"}</td>
                                <td className="py-1.5 pr-4 font-mono text-gray-500">{li.mfr_serial || "—"}</td>
                                <td className="py-1.5 pr-4 text-right">{li.quantity}</td>
                                <td className="py-1.5 pr-4 text-right">{fmt(li.unit_price)}</td>
                                <td className="py-1.5 text-right font-medium">{fmt(li.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
