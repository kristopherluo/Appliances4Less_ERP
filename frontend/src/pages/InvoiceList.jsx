import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useStore } from "../context/StoreContext";
import InvoiceEditModal from "../components/InvoiceEditModal";

export default function InvoiceList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { stores } = useStore();

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDateStr = (d) => d.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(toDateStr(firstOfMonth));
  const [endDate, setEndDate] = useState(toDateStr(now));
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedSalesman, setSelectedSalesman] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [editInvoice, setEditInvoice] = useState(null);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      setEditInvoice(null);
    },
  });

  function parseWarrantyPrice(wp) {
    if (!wp) return 0;
    try { return parseFloat(String(wp).replace("$", "").trim()) || 0; } catch { return 0; }
  }

  const filtered = useMemo(() =>
    invoices
      .filter((inv) => !selectedStoreId || inv.store_id === Number(selectedStoreId))
      .filter((inv) => !selectedSalesman || inv.salesman?.toLowerCase() === selectedSalesman.toLowerCase())
      .filter((inv) => {
        const d = new Date(inv.created_at);
        return d >= new Date(startDate) && d <= new Date(endDate + "T23:59:59");
      }),
    [invoices, selectedStoreId, selectedSalesman, startDate, endDate]
  );

  // Unique salesmen from all (unfiltered) invoices for the dropdown
  const salesmenOptions = useMemo(() => {
    const seen = new Map();
    for (const inv of invoices) {
      if (!inv.salesman) continue;
      const key = inv.salesman.toLowerCase();
      if (!seen.has(key)) seen.set(key, inv.salesman);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  const stats = useMemo(() => {
    const orders = filtered.length;
    const totalRevenue = filtered.reduce((s, inv) => s + Number(inv.total_amount), 0);
    const totalTax = filtered.reduce((s, inv) => s + Number(inv.tax_amount), 0);
    const preTax = totalRevenue - totalTax;

    let totalProfit = 0;
    let hasProfitData = false;
    for (const inv of filtered) {
      const knownCosts = (inv.line_items ?? []).filter((li) => li.cost_price != null);
      if (knownCosts.length > 0) {
        hasProfitData = true;
        const cost = knownCosts.reduce((s, li) => s + li.cost_price, 0);
        totalProfit += Number(inv.total_amount) - cost;
      }
    }

    return { orders, preTax, totalTax, totalRevenue, totalProfit, hasProfitData };
  }, [filtered]);

  const fmt = (n) =>
    `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtDate = (s) =>
    new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  function exportCSV() {
    const headers = [
      "address 1", "street address", "city", "state", "zip", "email",
      "Retail Price of Coverage", "warranty", "warranty company", "contract SKU",
      "Provider SKU price", "brand", "serial number", "KW Code", "item description",
      "Model Number", "Invoice Date", "Delivery Date",
    ];
    const rows = [headers];
    for (const inv of filtered) {
      for (const li of inv.line_items ?? []) {
        if (li.warranty_provider !== "ONPOINT") continue;
        const addr1 = [
          inv.delivery_street,
          inv.delivery_city && inv.delivery_state
            ? `${inv.delivery_city}, ${inv.delivery_state} ${inv.delivery_zip || ""}`.trim()
            : inv.delivery_city || "",
        ].filter(Boolean).join(", ");
        const invDate = inv.invoice_date
          ? new Date(inv.invoice_date).toLocaleDateString("en-US")
          : fmtDate(inv.created_at);
        rows.push([
          addr1, inv.delivery_street || "", inv.delivery_city || "",
          inv.delivery_state || "", inv.delivery_zip || "", inv.customer_email || "",
          li.warranty_price || "", li.warranty_term || "", li.warranty_provider || "",
          li.ac_code || "", li.warranty_price || "", li.brand || "",
          li.mfr_serial || "", li.kw_code || "", li.appliance_type || "",
          li.model_number || "", invDate, "",
        ]);
      }
    }
    const csv = rows
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `onpoint-${startDate}-${endDate}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  const colHeaders = [
    "Invoice #", "Date", "Items", "Grand Total", "Customer", "Salesman",
    "Warranty", "Warranty Provider", "P1 Amount", "P1 Method", "P2 Amount", "P2 Method", "Balance", "",
  ];

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-xl font-semibold text-gray-800 mr-2">Sales</h2>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="text-gray-400 text-sm">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
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
        <select
          value={selectedSalesman}
          onChange={(e) => setSelectedSalesman(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All Salesmen</option>
          {salesmenOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={exportCSV}
          className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-1.5 rounded text-sm font-medium"
        >
          Export CSV
        </button>
        <button
          onClick={() => navigate("/invoices/new")}
          className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded text-sm font-medium"
        >
          + New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Orders", value: stats.orders },
          { label: "Pre-Tax Revenue", value: fmt(stats.preTax) },
          { label: "Total Tax", value: fmt(stats.totalTax) },
          { label: "Total Revenue", value: fmt(stats.totalRevenue) },
          {
            label: "Total Profit",
            value: stats.hasProfitData ? fmt(stats.totalProfit) : "—",
            note: !stats.hasProfitData ? "No cost data" : undefined,
          },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className={`text-xl font-semibold ${s.label === "Total Profit" && stats.hasProfitData ? "text-green-700" : "text-gray-800"}`}>
              {s.value}
            </p>
            {s.note && <p className="text-xs text-gray-400">{s.note}</p>}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                {colHeaders.map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={colHeaders.length} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={colHeaders.length} className="px-4 py-8 text-center text-gray-400">
                    No invoices for {startDate} – {endDate}
                  </td>
                </tr>
              )}
              {filtered.map((inv) => {
                const expanded = expandedIds.has(inv.id);
                const warrantySum = (inv.line_items ?? []).reduce(
                  (s, li) => s + parseWarrantyPrice(li.warranty_price), 0
                );
                const providers = [...new Set(
                  (inv.line_items ?? []).map((li) => li.warranty_provider).filter(Boolean)
                )].join(", ");
                const totalPaid = inv.is_split_payment
                  ? [inv.payment_1_amount, inv.payment_2_amount, inv.payment_3_amount]
                      .reduce((s, a) => s + (a ?? 0), 0)
                  : Number(inv.total_amount);
                const balance = Math.max(Number(inv.total_amount) - totalPaid, 0);
                const displayDate = inv.invoice_date
                  ? fmtDate(inv.invoice_date)
                  : fmtDate(inv.created_at);
                const firstName = (inv.customer_name || "").split(" ")[0];
                const lastName = (inv.customer_name || "").split(" ").slice(1).join(" ");
                const customerDisplay = [firstName, lastName].filter(Boolean).join(" ");

                return [
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-mono text-blue-700 font-semibold">
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
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{displayDate}</td>
                    <td className="px-3 py-2.5 text-gray-500">{inv.line_items?.length ?? 0}</td>
                    <td className="px-3 py-2.5 font-semibold text-green-700">{fmt(inv.total_amount)}</td>
                    <td className="px-3 py-2.5 font-medium">{customerDisplay}</td>
                    <td className="px-3 py-2.5 text-gray-600">{inv.salesman || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-700">{warrantySum > 0 ? fmt(warrantySum) : "—"}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{providers || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {inv.is_split_payment && inv.payment_1_amount != null ? fmt(inv.payment_1_amount) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">
                      {inv.is_split_payment ? (inv.payment_1_method || "—") : (inv.payment_method || "—")}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {inv.is_split_payment && inv.payment_2_amount != null ? fmt(inv.payment_2_amount) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">
                      {inv.is_split_payment ? (inv.payment_2_method || "—") : "—"}
                    </td>
                    <td className={`px-3 py-2.5 font-medium ${balance > 0.01 ? "text-amber-600" : "text-gray-400"}`}>
                      {balance > 0.01 ? fmt(balance) : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        onClick={() => setEditInvoice(inv)}
                        className="text-blue-600 hover:underline text-xs mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, "_blank")}
                        className="text-gray-500 hover:underline text-xs"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>,
                  expanded && (
                    <tr key={`${inv.id}-items`} className="bg-blue-50/40">
                      <td colSpan={colHeaders.length} className="px-8 py-3">
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

      {editInvoice && (
        <InvoiceEditModal
          invoice={editInvoice}
          onClose={() => setEditInvoice(null)}
          onSaved={() => {
            setEditInvoice(null);
            qc.invalidateQueries({ queryKey: ["invoices"] });
          }}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
    </div>
  );
}
