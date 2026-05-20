import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import ItemModal from "../components/ItemModal";
import { useStore } from "../context/StoreContext";

const APPLIANCE_TYPES = [
  "Washer", "Dryer", "Refrigerator", "Dishwasher", "Range", "Oven",
  "Microwave", "Freezer", "AC Unit", "Other",
];

export default function Inventory() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { stores } = useStore();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStock, setFilterStock] = useState("in");
  const [filterStoreId, setFilterStoreId] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStoreId, setImportStoreId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef();

  // Always fetch all items — filter client-side to avoid query-key cache bugs
  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get("/inventory/").then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/inventory/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const items = useMemo(() => {
    const base = filterStoreId
      ? allItems.filter((i) => i.store_id === Number(filterStoreId))
      : allItems;
    return base.filter((i) => {
      if (i.is_in_stock) return true;
      const d = new Date(i.updated_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [allItems, filterStoreId]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        item.name?.toLowerCase().includes(q) ||
        item.ac_code?.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q) ||
        item.model_number?.toLowerCase().includes(q) ||
        item.serial_number?.toLowerCase().includes(q) ||
        item.grade?.toLowerCase().includes(q) ||
        item.location?.toLowerCase().includes(q);
      const matchType = !filterType || item.appliance_type === filterType;
      const matchStock =
        filterStock === "all" ||
        (filterStock === "in" && item.is_in_stock) ||
        (filterStock === "out" && !item.is_in_stock);
      return matchSearch && matchType && matchStock;
    });
  }, [items, search, filterType, filterStock]);

  const stats = useMemo(() => {
    const inStock = items.filter((i) => i.is_in_stock);
    return {
      total: items.length,
      inStock: inStock.length,
      totalCost: inStock.reduce((s, i) => s + i.cost_price, 0),
      totalRetail: inStock.reduce((s, i) => s + i.sale_price, 0),
    };
  }, [items]);

  const defaultStoreId = filterStoreId ? Number(filterStoreId) : stores[0]?.id;

  function openImportModal() {
    setImportStoreId(filterStoreId || stores[0]?.id?.toString() || "");
    setImportMsg("");
    setShowImportModal(true);
  }

  function triggerFilePicker() {
    if (!importStoreId) return;
    fileInputRef.current.click();
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file || !importStoreId) return;
    setImporting(true);
    setImportMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("store_id", importStoreId);
      const { data } = await api.post("/inventory/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportMsg(`Imported ${data.imported} items (${data.skipped} skipped)`);
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      setImportMsg(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
      fileInputRef.current.value = "";
    }
  }

  function confirmDelete(item) {
    if (window.confirm(`Delete "${item.name}"?`)) {
      deleteMutation.mutate(item.id);
    }
  }

  const fmt = (n) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total Units", value: stats.total },
          { label: "In Stock", value: stats.inStock },
          { label: "Cost Value (in stock)", value: fmt(stats.totalCost) },
          { label: "Retail Value (in stock)", value: fmt(stats.totalRetail) },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className="text-xl font-semibold text-gray-800">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search name, code, brand, model, serial…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <select
          value={filterStoreId}
          onChange={(e) => setFilterStoreId(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All Locations</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All Types</option>
          {APPLIANCE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          value={filterStock}
          onChange={(e) => setFilterStock(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">All Stock</option>
          <option value="in">In Stock</option>
          <option value="out">Out of Stock</option>
        </select>
        <div className="flex-1" />
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        <button
          onClick={openImportModal}
          className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm"
        >
          Import Excel
        </button>
        <button
          onClick={() => navigate("/invoices/new")}
          className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm"
        >
          New Invoice
        </button>
        <button
          onClick={() => { setEditItem(null); setShowModal(true); }}
          className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded text-sm font-medium"
        >
          + Add Item
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                {["A/C Code", "Brand", "Type", "Details", "Model #", "Serial #", "Grade", "Location", "Cost", "Sale Price", "In Stock", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">No items found</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.ac_code || "—"}</td>
                  <td className="px-3 py-2 font-medium">{item.brand || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{item.appliance_type || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.name}</div>
                    {item.model_name && <div className="text-xs text-gray-400">{item.model_name}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.model_number || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.serial_number || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{item.grade || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{item.location || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmt(item.cost_price)}</td>
                  <td className="px-3 py-2 text-right font-medium text-green-700">{fmt(item.sale_price)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${item.is_in_stock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {item.is_in_stock ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => { setEditItem(item); setShowModal(true); }} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                    <button onClick={() => confirmDelete(item)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
          <span>{filtered.length > 0 ? `Showing ${filtered.length} of ${items.length} items` : ""}</span>
          <span>Out-of-stock items shown for current month only</span>
        </div>
      </div>

      {/* Import location modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-gray-800">Import Excel</h2>
              <button
                onClick={() => { setShowImportModal(false); setImportMsg(""); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Import items into location</label>
              <select
                value={importStoreId}
                onChange={(e) => setImportStoreId(e.target.value)}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select location…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {importMsg && (
              <p className={`text-xs mb-3 px-2 py-1 rounded ${importMsg.startsWith("Import") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                {importMsg}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowImportModal(false); setImportMsg(""); }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                {importMsg.startsWith("Import") ? "Close" : "Cancel"}
              </button>
              <button
                onClick={triggerFilePicker}
                disabled={!importStoreId || importing}
                className="px-4 py-1.5 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-40"
              >
                {importing ? "Importing…" : "Choose File…"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <ItemModal
          item={editItem}
          stores={stores}
          defaultStoreId={defaultStoreId}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            qc.invalidateQueries({ queryKey: ["items"] });
          }}
        />
      )}
    </div>
  );
}
