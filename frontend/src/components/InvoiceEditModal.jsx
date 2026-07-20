import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";

const PAYMENT_METHODS = ["Cash", "Debit", "Credit", "Check", "Financing", "Other"];
const WARRANTY_PROVIDERS = ["ONPOINT", "CPS", "MANUFACTURE", "MANUFACTURE+ONPOINT", "STORE", "FRONTIER"];

const fieldCls = "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const inp = "border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300";
const roVal = "text-xs text-gray-700 px-1 py-1 leading-tight";

const fmt = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoiceEditModal({ invoice: initialInvoice, onClose, onSaved, onDelete }) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [splitPayment, setSplitPayment] = useState(initialInvoice.is_split_payment || false);
  const [singleMethod, setSingleMethod] = useState(initialInvoice.payment_method || "");
  const [payments, setPayments] = useState([
    { method: initialInvoice.payment_1_method || "", amount: initialInvoice.payment_1_amount ?? "" },
    { method: initialInvoice.payment_2_method || "", amount: initialInvoice.payment_2_amount ?? "" },
    { method: initialInvoice.payment_3_method || "", amount: initialInvoice.payment_3_amount ?? "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Per-row edit state: lineItemId → fields object (undefined = read-only)
  const [editingLines, setEditingLines] = useState({});
  const [itemSearch, setItemSearch] = useState("");
  const [lineOpLoading, setLineOpLoading] = useState(false);

  const { data: inventory = [] } = useQuery({
    queryKey: ["items", invoice.store_id],
    queryFn: () => api.get("/inventory/", { params: { store_id: invoice.store_id } }).then((r) => r.data),
  });

  const inStock = inventory.filter((i) => i.is_in_stock);
  const addedItemIds = new Set((invoice.line_items ?? []).filter((li) => li.item_id).map((li) => li.item_id));

  const searchResults = itemSearch.length > 1
    ? inStock.filter((i) => {
        if (addedItemIds.has(i.id)) return false;
        const q = itemSearch.toLowerCase();
        return (
          i.name?.toLowerCase().includes(q) ||
          i.model_number?.toLowerCase().includes(q) ||
          i.appliance_type?.toLowerCase().includes(q) ||
          i.brand?.toLowerCase().includes(q) ||
          i.ac_code?.toLowerCase().includes(q) ||
          i.serial_number?.toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  const { register, handleSubmit } = useForm({
    defaultValues: {
      customer_name: initialInvoice.customer_name || "",
      customer_phone: initialInvoice.customer_phone || "",
      customer_email: initialInvoice.customer_email || "",
      salesman: initialInvoice.salesman || "",
      invoice_date: initialInvoice.invoice_date
        ? new Date(initialInvoice.invoice_date).toISOString().slice(0, 10)
        : initialInvoice.created_at
        ? new Date(initialInvoice.created_at).toISOString().slice(0, 10)
        : "",
      delivery_street: initialInvoice.delivery_street || "",
      delivery_city: initialInvoice.delivery_city || "",
      delivery_state: initialInvoice.delivery_state || "",
      delivery_zip: initialInvoice.delivery_zip || "",
      notes: initialInvoice.notes || "",
      has_non_appliance_services: initialInvoice.has_non_appliance_services || false,
      non_appliance_description: initialInvoice.non_appliance_description || "",
    },
  });

  function startEditLine(li) {
    setEditingLines((prev) => ({
      ...prev,
      [li.id]: {
        appliance_type: li.appliance_type || "",
        description: li.description || "",
        model_number: li.model_number || "",
        ac_code: li.ac_code || "",
        kw_code: li.kw_code || "",
        mfr_serial: li.mfr_serial || "",
        brand: li.brand || "",
        quantity: li.quantity,
        unit_price: li.unit_price,
        warranty_term: li.warranty_term || "",
        warranty_price: li.warranty_price || "",
        warranty_id: li.warranty_id || "",
        warranty_provider: li.warranty_provider || "ONPOINT",
      },
    }));
  }

  function updateEditLine(lineId, field, value) {
    setEditingLines((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }));
  }

  function cancelEditLine(lineId) {
    setEditingLines((prev) => { const n = { ...prev }; delete n[lineId]; return n; });
  }

  async function saveEditLine(lineId) {
    const changes = editingLines[lineId];
    if (!changes) return;
    setLineOpLoading(true);
    try {
      const { data } = await api.patch(`/invoices/${invoice.id}/line-items/${lineId}`, {
        ...changes,
        quantity: Number(changes.quantity),
        unit_price: parseFloat(changes.unit_price),
      });
      setInvoice(data);
      cancelEditLine(lineId);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to save line item");
    } finally {
      setLineOpLoading(false);
    }
  }

  async function removeLineItem(lineId) {
    if (!window.confirm("Remove this item from the invoice? It will be restored to in-stock if it's an inventory item.")) return;
    setLineOpLoading(true);
    try {
      const { data } = await api.delete(`/invoices/${invoice.id}/line-items/${lineId}`);
      setInvoice(data);
      cancelEditLine(lineId);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to remove line item");
    } finally {
      setLineOpLoading(false);
    }
  }

  async function addFromInventory(item) {
    setItemSearch("");
    setLineOpLoading(true);
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/line-items`, {
        item_id: item.id,
        appliance_type: item.appliance_type || "",
        description: item.name,
        model_number: item.model_number || "",
        ac_code: item.ac_code || "",
        kw_code: item.kw_code || "",
        mfr_serial: item.serial_number || "",
        brand: item.brand || "",
        quantity: 1,
        unit_price: item.sale_price,
        warranty_term: "1year",
        warranty_price: "$0",
        warranty_id: "",
        warranty_provider: "ONPOINT",
      });
      setInvoice(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to add item");
    } finally {
      setLineOpLoading(false);
    }
  }

  async function addBlankLine() {
    setLineOpLoading(true);
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/line-items`, {
        item_id: null,
        appliance_type: "",
        description: "",
        model_number: "",
        ac_code: "",
        kw_code: "",
        mfr_serial: "",
        brand: "",
        quantity: 1,
        unit_price: 0,
        warranty_term: "1year",
        warranty_price: "$0",
        warranty_id: "",
        warranty_provider: "ONPOINT",
      });
      // Auto-open edit for the new blank line
      const newLine = data.line_items[data.line_items.length - 1];
      setInvoice(data);
      if (newLine) startEditLine(newLine);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to add blank line");
    } finally {
      setLineOpLoading(false);
    }
  }

  async function onSubmit(data) {
    setSaving(true);
    setError("");
    try {
      const { data: updated } = await api.patch(`/invoices/${invoice.id}`, {
        ...data,
        invoice_date: data.invoice_date ? new Date(data.invoice_date).toISOString() : null,
        is_split_payment: splitPayment,
        payment_method: splitPayment ? null : singleMethod || null,
        payment_1_method: splitPayment ? payments[0].method || null : null,
        payment_1_amount: splitPayment ? parseFloat(payments[0].amount) || null : null,
        payment_2_method: splitPayment ? payments[1].method || null : null,
        payment_2_amount: splitPayment ? parseFloat(payments[1].amount) || null : null,
        payment_3_method: splitPayment ? payments[2].method || null : null,
        payment_3_amount: splitPayment ? parseFloat(payments[2].amount) || null : null,
        has_non_appliance_services: data.has_non_appliance_services === true || data.has_non_appliance_services === "true",
      });
      setInvoice(updated);
      onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const totalPaid = splitPayment
    ? [payments[0].amount, payments[1].amount, payments[2].amount].reduce((s, a) => s + (parseFloat(a) || 0), 0)
    : invoice.total_amount;
  const balance = Math.max(Number(invoice.total_amount) - totalPaid, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">Edit Invoice #{String(invoice.id).padStart(5, "0")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <form id="invoice-edit-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-5 space-y-5">

            {/* ── CUSTOMER ── */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-700 mb-3">Customer</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input {...register("customer_name")} className={fieldCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input {...register("customer_phone")} className={fieldCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input {...register("customer_email")} type="email" className={fieldCls} />
                </div>

                {/* Delivery address inside Customer card, matching NewInvoice */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Street</label>
                  <input {...register("delivery_street")} className={fieldCls} placeholder="123 Main St" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                  <input {...register("delivery_city")} className={fieldCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                    <input {...register("delivery_state")} className={fieldCls} placeholder="CA" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
                    <input {...register("delivery_zip")} className={fieldCls} placeholder="90210" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── LINE ITEMS ── */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-700 mb-3">Items</h3>

              {/* Inventory search — above the table */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search inventory by type, model #, serial #, A/C code, brand…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full border border-blue-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  disabled={lineOpLoading}
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addFromInventory(item)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex justify-between items-start"
                      >
                        <span>
                          <span className="font-medium">{item.appliance_type || item.name}</span>
                          {item.brand && <span className="text-gray-500 ml-1">· {item.brand}</span>}
                          {item.model_number && <span className="text-gray-500 ml-1">· {item.model_number}</span>}
                          {item.ac_code && <span className="text-gray-400 ml-1 text-xs">· A/C: {item.ac_code}</span>}
                          {item.serial_number && <span className="text-gray-400 ml-1 text-xs">· S/N: {item.serial_number}</span>}
                        </span>
                        <span className="text-green-700 font-medium ml-4 shrink-0">{fmt(item.sale_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Line item table */}
              {(invoice.line_items ?? []).length > 0 && (
                <div className="overflow-x-auto mb-3">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b">
                        <th className="text-left pb-1 pr-2">Type</th>
                        <th className="text-left pb-1 pr-2">Description</th>
                        <th className="text-left pb-1 pr-2">Brand</th>
                        <th className="text-left pb-1 pr-2">Model #</th>
                        <th className="text-left pb-1 pr-2">A/C Code</th>
                        <th className="text-left pb-1 pr-2">Serial #</th>
                        <th className="text-right pb-1 pr-2">Qty</th>
                        <th className="text-right pb-1 pr-2">Unit Price</th>
                        <th className="text-right pb-1 pr-6">Subtotal</th>
                        <th className="pb-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invoice.line_items ?? []).map((li) => {
                        const editing = editingLines[li.id];
                        const e = editing || {};
                        return (
                          <>
                            {/* Main row */}
                            <tr key={`main-${li.id}`} className="border-t border-gray-100">
                              <td className="pr-2 pt-2 pb-1">
                                {editing ? (
                                  <input value={e.appliance_type} onChange={(ev) => updateEditLine(li.id, "appliance_type", ev.target.value)} className={`${inp} w-20`} placeholder="Type" />
                                ) : (
                                  <span className={`${roVal} w-20 block`}>{li.appliance_type || <span className="text-gray-300">—</span>}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1">
                                {editing ? (
                                  <input value={e.description} onChange={(ev) => updateEditLine(li.id, "description", ev.target.value)} className={`${inp} w-40`} placeholder="Description" />
                                ) : (
                                  <span className={`${roVal} w-40 block`}>{li.description || <span className="text-gray-300">—</span>}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1">
                                {editing ? (
                                  <input value={e.brand} onChange={(ev) => updateEditLine(li.id, "brand", ev.target.value)} className={`${inp} w-24`} placeholder="Brand" />
                                ) : (
                                  <span className={`${roVal} w-24 block`}>{li.brand || <span className="text-gray-300">—</span>}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1">
                                {editing ? (
                                  <input value={e.model_number} onChange={(ev) => updateEditLine(li.id, "model_number", ev.target.value)} className={`${inp} w-28 font-mono`} placeholder="Model #" />
                                ) : (
                                  <span className={`${roVal} w-28 block font-mono`}>{li.model_number || <span className="text-gray-300">—</span>}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1">
                                {editing ? (
                                  <input value={e.ac_code} onChange={(ev) => updateEditLine(li.id, "ac_code", ev.target.value)} className={`${inp} w-20 font-mono`} placeholder="A/C" />
                                ) : (
                                  <span className={`${roVal} w-20 block font-mono`}>{li.ac_code || <span className="text-gray-300">—</span>}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1">
                                {editing ? (
                                  <input value={e.mfr_serial} onChange={(ev) => updateEditLine(li.id, "mfr_serial", ev.target.value)} className={`${inp} w-28 font-mono`} placeholder="Serial #" />
                                ) : (
                                  <span className={`${roVal} w-28 block font-mono`}>{li.mfr_serial || <span className="text-gray-300">—</span>}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1 text-right">
                                {editing ? (
                                  <input type="number" min="1" value={e.quantity} onChange={(ev) => updateEditLine(li.id, "quantity", ev.target.value)} className={`${inp} w-12 text-right`} />
                                ) : (
                                  <span className={`${roVal} w-12 block text-right`}>{li.quantity}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1 text-right">
                                {editing ? (
                                  <input type="number" min="0" step="0.01" value={e.unit_price} onChange={(ev) => updateEditLine(li.id, "unit_price", ev.target.value)} className={`${inp} w-20 text-right`} />
                                ) : (
                                  <span className={`${roVal} w-20 block text-right`}>{fmt(li.unit_price)}</span>
                                )}
                              </td>
                              <td className="pr-2 pt-2 pb-1 text-right font-medium whitespace-nowrap">
                                {fmt(li.subtotal)}
                              </td>
                              <td className="pl-6 pt-2 pb-1 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {editing ? (
                                    <>
                                      <button type="button" disabled={lineOpLoading} onClick={() => saveEditLine(li.id)} className="text-xs px-2 py-0.5 rounded border border-blue-400 text-blue-600 hover:bg-blue-50 disabled:opacity-40">Save</button>
                                      <button type="button" onClick={() => cancelEditLine(li.id)} className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">Cancel</button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => startEditLine(li)} className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400">Edit</button>
                                  )}
                                  <button type="button" disabled={lineOpLoading} onClick={() => removeLineItem(li.id)} className="text-red-400 hover:text-red-600 disabled:opacity-40 text-xs">✕</button>
                                </div>
                              </td>
                            </tr>

                            {/* Warranty / codes sub-row — always visible */}
                            <tr key={`detail-${li.id}`}>
                              <td colSpan={10} className="pb-2 pr-2">
                                <div className="flex flex-wrap gap-2 bg-gray-50 rounded px-2 py-1.5 text-xs items-center">
                                  <label className="flex items-center gap-1 text-gray-500">KW Code
                                    {editing ? (
                                      <input value={e.kw_code} onChange={(ev) => updateEditLine(li.id, "kw_code", ev.target.value)} className={`${inp} w-24 font-mono`} placeholder="KW" />
                                    ) : (
                                      <span className="font-mono text-gray-700">{li.kw_code || "—"}</span>
                                    )}
                                  </label>
                                  <span className="border-l border-gray-200 h-4 mx-1" />
                                  <label className="flex items-center gap-1 text-gray-500">Warranty Term
                                    {editing ? (
                                      <input value={e.warranty_term} onChange={(ev) => updateEditLine(li.id, "warranty_term", ev.target.value)} className={`${inp} w-20`} placeholder="1year" />
                                    ) : (
                                      <span className="text-gray-700">{li.warranty_term || "—"}</span>
                                    )}
                                  </label>
                                  <label className="flex items-center gap-1 text-gray-500">Price $
                                    {editing ? (
                                      <input value={(e.warranty_price || "").replace(/^\$/, "")} onChange={(ev) => updateEditLine(li.id, "warranty_price", `$${ev.target.value}`)} className={`${inp} w-14`} placeholder="0" />
                                    ) : (
                                      <span className="text-gray-700">{li.warranty_price || "—"}</span>
                                    )}
                                  </label>
                                  <label className="flex items-center gap-1 text-gray-500">ID
                                    {editing ? (
                                      <input value={e.warranty_id} onChange={(ev) => updateEditLine(li.id, "warranty_id", ev.target.value)} className={`${inp} w-32`} placeholder="ID" />
                                    ) : (
                                      <span className="text-gray-700">{li.warranty_id || "—"}</span>
                                    )}
                                  </label>
                                  <label className="flex items-center gap-1 text-gray-500">Provider
                                    {editing ? (
                                      <select value={e.warranty_provider} onChange={(ev) => updateEditLine(li.id, "warranty_provider", ev.target.value)} className={`${inp} w-36`}>
                                        {WARRANTY_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                                      </select>
                                    ) : (
                                      <span className="text-gray-700">{li.warranty_provider || "—"}</span>
                                    )}
                                  </label>
                                </div>
                              </td>
                            </tr>
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <button type="button" onClick={addBlankLine} disabled={lineOpLoading} className="text-blue-600 hover:underline text-sm disabled:opacity-40">
                + Add blank line
              </button>

              {/* Live totals */}
              <div className="text-xs text-gray-500 mt-3">
                Subtotal: <span className="font-medium text-gray-800">{fmt(invoice.subtotal)}</span>
                {invoice.delivery_fee > 0 && <> · Delivery: <span className="font-medium text-gray-800">{fmt(invoice.delivery_fee)}</span></>}
                {invoice.tax_amount > 0 && <> · Tax: <span className="font-medium text-gray-800">{fmt(invoice.tax_amount)}</span></>}
                <> · <span className="font-semibold text-green-700">Total: {fmt(invoice.total_amount)}</span></>
              </div>
            </div>

            {/* ── OTHER INFO ── */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-700 mb-3">Other Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Salesman</label>
                  <input {...register("salesman")} className={fieldCls} placeholder="Name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date</label>
                  <input {...register("invoice_date")} type="date" className={fieldCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Other Services (Non-Appliance)?</label>
                  <select {...register("has_non_appliance_services")} className={fieldCls}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Non-Appliance Description</label>
                  <input {...register("non_appliance_description")} className={fieldCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea {...register("notes")} rows={2} className={fieldCls} />
                </div>
              </div>
            </div>

            {/* ── PAYMENT ── */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-700 mb-3">Payment</h3>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-gray-600">Split Payment?</span>
                <button
                  type="button"
                  onClick={() => setSplitPayment((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${splitPayment ? "bg-blue-600" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${splitPayment ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <span className="text-sm text-gray-500">{splitPayment ? "Yes" : "No"}</span>
                {splitPayment && balance > 0.01 && (
                  <span className="text-xs text-amber-600 ml-2">Balance: {fmt(balance)}</span>
                )}
              </div>
              {!splitPayment ? (
                <div className="max-w-xs">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                  <select value={singleMethod} onChange={(e) => setSingleMethod(e.target.value)} className={fieldCls}>
                    <option value="">— Select —</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {payments.map((p, i) => (
                    <div key={i} className="space-y-2">
                      <p className="text-xs font-medium text-gray-600">Payment {i + 1}</p>
                      <select
                        value={p.method}
                        onChange={(e) => setPayments((prev) => prev.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}
                        className={fieldCls}
                      >
                        <option value="">— Select —</option>
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={p.amount}
                        onChange={(e) => setPayments((prev) => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                        placeholder="Amount"
                        className={fieldCls}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete this invoice? Inventory items will be restored to in-stock.")) {
                onDelete(invoice.id);
              }
            }}
            className="px-4 py-2 text-sm bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
          >
            Delete Invoice
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" form="invoice-edit-form" disabled={saving} className="px-4 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
