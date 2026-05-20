import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import api from "../lib/api";
import { useStore } from "../context/StoreContext";

const DEFAULT_WARRANTY = {
  warranty_term: "1 year",
  warranty_price: "$0",
  warranty_id: "",
  warranty_provider: "ONPOINT",
};

const PAYMENT_METHODS = ["Cash", "Debit", "Credit", "Check", "Financing", "Other"];

export default function NewInvoice() {
  const navigate = useNavigate();
  const { stores } = useStore();
  const [storeId, setStoreId] = useState(null);

  useEffect(() => {
    if (stores.length > 0 && !storeId) setStoreId(stores[0].id);
  }, [stores]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { tax_rate: 0, delivery_fee: 0 },
  });

  const [lineItems, setLineItems] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [error, setError] = useState("");

  const { data: inventory = [] } = useQuery({
    queryKey: ["items", storeId],
    queryFn: () =>
      api.get("/inventory/", { params: storeId ? { store_id: storeId } : {} }).then((r) => r.data),
    enabled: !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post("/invoices/", data),
    onSuccess: () => navigate("/invoices"),
  });

  const inStock = inventory.filter((i) => i.is_in_stock);
  const addedItemIds = new Set(lineItems.filter((li) => li.item_id).map((li) => li.item_id));

  const searchResults =
    itemSearch.length > 1
      ? inStock
          .filter((i) => {
            if (addedItemIds.has(i.id)) return false;
            const q = itemSearch.toLowerCase();
            return (
              i.name?.toLowerCase().includes(q) ||
              i.model_number?.toLowerCase().includes(q) ||
              i.model_name?.toLowerCase().includes(q) ||
              i.serial_number?.toLowerCase().includes(q) ||
              i.appliance_type?.toLowerCase().includes(q) ||
              i.brand?.toLowerCase().includes(q) ||
              i.ac_code?.toLowerCase().includes(q)
            );
          })
          .slice(0, 10)
      : [];

  function addFromInventory(item) {
    setLineItems((prev) => [
      ...prev,
      {
        item_id: item.id,
        _editingItem: false,
        appliance_type: item.appliance_type || "",
        description: item.name,
        model_number: item.model_number || "",
        ac_code: item.ac_code || "",
        kw_code: item.kw_code || "",
        mfr_serial: item.serial_number || "",
        quantity: 1,
        unit_price: item.sale_price,
        ...DEFAULT_WARRANTY,
      },
    ]);
    setItemSearch("");
  }

  function addBlankLine() {
    setLineItems((prev) => [
      ...prev,
      {
        item_id: null,
        _editingItem: true,
        appliance_type: "",
        description: "",
        model_number: "",
        ac_code: "",
        kw_code: "",
        mfr_serial: "",
        quantity: 1,
        unit_price: 0,
        ...DEFAULT_WARRANTY,
      },
    ]);
  }

  function updateLine(idx, field, value) {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [field]: value } : li)));
  }

  function removeLine(idx) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveItemEdit(idx) {
    const li = lineItems[idx];
    if (!li.item_id) {
      updateLine(idx, "_editingItem", false);
      return;
    }
    const confirmed = window.confirm(
      "Saving will update this item in the inventory. Continue?"
    );
    if (!confirmed) return;
    try {
      await api.patch(`/inventory/${li.item_id}`, {
        appliance_type: li.appliance_type || null,
        name: li.description || null,
        model_number: li.model_number || null,
        serial_number: li.mfr_serial || null,
        ac_code: li.ac_code || null,
        kw_code: li.kw_code || null,
      });
    } catch {
      // best-effort sync; invoice creation is not blocked by this
    }
    updateLine(idx, "_editingItem", false);
  }

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);

  async function onSubmit(data) {
    if (lineItems.length === 0) { setError("Add at least one line item"); return; }
    if (!storeId) { setError("No store selected"); return; }

    const hasUnsaved = lineItems.some((li) => li.item_id && li._editingItem);
    if (hasUnsaved) {
      const proceed = window.confirm(
        "Some item edits have not been saved to inventory. Create the invoice anyway?"
      );
      if (!proceed) return;
    }

    setError("");
    try {
      await createMutation.mutateAsync({
        ...data,
        store_id: storeId,
        payment_method: data.payment_method || null,
        tax_rate: parseFloat(data.tax_rate) || 0,
        delivery_fee: parseFloat(data.delivery_fee) || 0,
        has_non_appliance_services:
          data.has_non_appliance_services === "true" || data.has_non_appliance_services === true,
        line_items: lineItems.map((li) => ({
          item_id: li.item_id,
          appliance_type: li.appliance_type,
          description: li.description,
          model_number: li.model_number,
          ac_code: li.ac_code,
          kw_code: li.kw_code,
          mfr_serial: li.mfr_serial,
          quantity: Number(li.quantity),
          unit_price: parseFloat(li.unit_price),
          warranty_term: li.warranty_term,
          warranty_price: li.warranty_price,
          warranty_id: li.warranty_id,
          warranty_provider: li.warranty_provider,
        })),
      });
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to create invoice");
    }
  }

  const fmt = (n) =>
    `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const inp = "border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300";
  const roVal = "text-xs text-gray-700 px-1 py-1 leading-tight";

  return (
    <div className="max-w-7xl">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate("/invoices")} className="text-gray-500 hover:text-gray-700 text-sm">
          ← Back
        </button>
        <h2 className="text-xl font-semibold text-gray-800">New Invoice</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Location */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <select
            value={storeId || ""}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.address ? ` — ${s.address}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Customer info */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="font-semibold text-gray-700 mb-3">Customer</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                {...register("customer_name", { required: "Required" })}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {errors.customer_name && (
                <p className="text-red-500 text-xs">{errors.customer_name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                {...register("customer_phone")}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                {...register("customer_email")}
                type="email"
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
              <textarea
                {...register("customer_address")}
                rows={2}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Address</label>
              <textarea
                {...register("delivery_address")}
                rows={2}
                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="font-semibold text-gray-700 mb-3">Items</h3>

          {/* Inventory search */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search inventory by type, model #, serial #, A/C code, brand…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full border border-blue-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                      {item.model_number && (
                        <span className="text-gray-500 ml-1">· {item.model_number}</span>
                      )}
                      {item.ac_code && (
                        <span className="text-gray-400 ml-1 text-xs">· A/C: {item.ac_code}</span>
                      )}
                      {item.serial_number && (
                        <span className="text-gray-400 ml-1 text-xs">· S/N: {item.serial_number}</span>
                      )}
                    </span>
                    <span className="text-green-700 font-medium ml-4 shrink-0">
                      {fmt(item.sale_price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Line item table */}
          {lineItems.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left pb-1 pr-2">Type</th>
                    <th className="text-left pb-1 pr-2">Description</th>
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
                  {lineItems.map((li, idx) => {
                    const locked = !!li.item_id && !li._editingItem;
                    return (
                      <>
                        {/* Main row */}
                        <tr key={`main-${idx}`} className="border-t border-gray-100">
                          <td className="pr-2 pt-2 pb-1">
                            {locked ? (
                              <span className={`${roVal} w-20 block`}>{li.appliance_type || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.appliance_type}
                                onChange={(e) => updateLine(idx, "appliance_type", e.target.value)}
                                className={`${inp} w-20`}
                                placeholder="Type"
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1">
                            {locked ? (
                              <span className={`${roVal} w-64 block`}>{li.description || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.description}
                                onChange={(e) => updateLine(idx, "description", e.target.value)}
                                className={`${inp} w-64`}
                                placeholder="Description"
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1">
                            {locked ? (
                              <span className={`${roVal} w-40 block font-mono`}>{li.model_number || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.model_number}
                                onChange={(e) => updateLine(idx, "model_number", e.target.value)}
                                className={`${inp} w-40 font-mono`}
                                placeholder="Model #"
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1">
                            {locked ? (
                              <span className={`${roVal} w-24 block font-mono`}>{li.ac_code || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.ac_code}
                                onChange={(e) => updateLine(idx, "ac_code", e.target.value)}
                                className={`${inp} w-24 font-mono`}
                                placeholder="A/C"
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1">
                            {locked ? (
                              <span className={`${roVal} w-40 block font-mono`}>{li.mfr_serial || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.mfr_serial}
                                onChange={(e) => updateLine(idx, "mfr_serial", e.target.value)}
                                className={`${inp} w-40 font-mono`}
                                placeholder="Serial #"
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1 text-right">
                            {locked ? (
                              <span className={`${roVal} w-12 block text-right`}>{li.quantity}</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                max={li.item_id ? 1 : undefined}
                                value={li.quantity}
                                onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))}
                                className={`${inp} w-12 text-right`}
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1 text-right">
                            {locked ? (
                              <span className={`${roVal} w-20 block text-right`}>{fmt(li.unit_price)}</span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={li.unit_price}
                                onChange={(e) =>
                                  updateLine(idx, "unit_price", parseFloat(e.target.value) || 0)
                                }
                                className={`${inp} w-20 text-right`}
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1 text-right font-medium whitespace-nowrap">
                            {fmt(li.quantity * li.unit_price)}
                          </td>
                          <td className="pl-6 pt-2 pb-1 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {li.item_id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    li._editingItem
                                      ? saveItemEdit(idx)
                                      : updateLine(idx, "_editingItem", true)
                                  }
                                  className={`text-xs px-2 py-0.5 rounded border ${
                                    li._editingItem
                                      ? "border-blue-400 text-blue-600 hover:bg-blue-50"
                                      : "border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400"
                                  }`}
                                >
                                  {li._editingItem ? "Save" : "Edit"}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="text-red-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Warranty / codes sub-row */}
                        <tr key={`detail-${idx}`}>
                          <td colSpan={9} className="pb-2 pr-2">
                            <div className="flex flex-wrap gap-2 bg-gray-50 rounded px-2 py-1.5 text-xs items-center">
                              <label className="flex items-center gap-1 text-gray-500">
                                KW Code
                                <input
                                  value={li.kw_code}
                                  onChange={(e) => updateLine(idx, "kw_code", e.target.value)}
                                  className={`${inp} w-24 font-mono`}
                                  placeholder="KW"
                                />
                              </label>

                              <span className="border-l border-gray-200 h-4 mx-1" />

                              <label className="flex items-center gap-1 text-gray-500">
                                Warranty Term
                                <input
                                  value={li.warranty_term}
                                  onChange={(e) => updateLine(idx, "warranty_term", e.target.value)}
                                  className={`${inp} w-20`}
                                  placeholder="1 year"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-gray-500">
                                Warranty Price
                                <input
                                  value={li.warranty_price}
                                  onChange={(e) => updateLine(idx, "warranty_price", e.target.value)}
                                  className={`${inp} w-16`}
                                  placeholder="$0"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-gray-500">
                                Warranty ID
                                <input
                                  value={li.warranty_id}
                                  onChange={(e) => updateLine(idx, "warranty_id", e.target.value)}
                                  className={`${inp} w-32`}
                                  placeholder="ID"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-gray-500">
                                Provider
                                <input
                                  value={li.warranty_provider}
                                  onChange={(e) => updateLine(idx, "warranty_provider", e.target.value)}
                                  className={`${inp} w-24`}
                                  placeholder="ONPOINT"
                                />
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

          <button type="button" onClick={addBlankLine} className="text-blue-600 hover:underline text-sm">
            + Add blank line
          </button>
        </div>

        {/* Other services + tax */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method *</label>
            <select
              {...register("payment_method", { required: "Required" })}
              className={`w-full border rounded px-2.5 py-1.5 text-sm ${errors.payment_method ? "border-red-400" : "border-gray-300"}`}
            >
              <option value="">— Select —</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {errors.payment_method && (
              <p className="text-red-500 text-xs mt-0.5">{errors.payment_method.message}</p>
            )}
          </div>
          <div />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Other Services (Non-Appliance)?
            </label>
            <select
              {...register("has_non_appliance_services")}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Non-Appliance Description
            </label>
            <input
              {...register("non_appliance_description")}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tax Rate (%)</label>
            <input
              {...register("tax_rate")}
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Fee ($)</label>
            <input
              {...register("delivery_fee")}
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              {...register("notes")}
              rows={2}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* Totals preview */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-right">
          <div className="text-gray-500">
            Subtotal: <span className="font-medium text-gray-800">{fmt(subtotal)}</span>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate("/invoices")}
            className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
          >
            {isSubmitting ? "Creating…" : "Create Invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}
