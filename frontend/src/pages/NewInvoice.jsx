import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import api from "../lib/api";
import { useStore } from "../context/StoreContext";

const DEFAULT_WARRANTY = {
  warranty_term: "1year",
  warranty_price: "$0",
  warranty_id: "",
  warranty_provider: "NA",
};

const PAYMENT_METHODS = ["Cash", "Debit", "Credit", "Check", "Financing", "Other"];
const WARRANTY_PROVIDERS = ["NA", "ONPOINT", "CPS", "MANUFACTURE", "STORE", "FRONTIER"];

const FIELD_LABELS = {
  customer_name: "Name",
  customer_email: "Email",
  invoice_date: "Invoice Date",
  delivery_street: "Delivery Street",
  delivery_city: "City",
  delivery_state: "State",
  delivery_zip: "Zip",
};

export default function NewInvoice() {
  const navigate = useNavigate();
  const { stores } = useStore();
  const [storeId, setStoreId] = useState(null);

  useEffect(() => {
    if (stores.length > 0 && !storeId) setStoreId(stores[0].id);
  }, [stores]);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      tax_rate: 0,
      delivery_fee: 0,
      invoice_date: new Date().toISOString().slice(0, 10),
    },
  });

  const [lineItems, setLineItems] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [error, setError] = useState("");
  const [splitPayment, setSplitPayment] = useState(false);
  // payment_method is kept in local state to avoid react-hook-form stale validation when hidden
  const [singlePaymentMethod, setSinglePaymentMethod] = useState("");
  const [singlePaymentError, setSinglePaymentError] = useState("");
  const [payments, setPayments] = useState([
    { method: "", amount: "0.00" },
    { method: "", amount: "0.00" },
    { method: "", amount: "0.00" },
  ]);

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
        brand: item.brand || "",
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
        brand: "",
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
  const [watchTaxRate, watchDeliveryFee] = watch(["tax_rate", "delivery_fee"]);
  const taxAmount = subtotal * ((parseFloat(watchTaxRate) || 0) / 100);
  const grandTotal = subtotal + taxAmount + (parseFloat(watchDeliveryFee) || 0);

  const splitSum = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const splitError =
    splitPayment && lineItems.length > 0 && Math.abs(splitSum - grandTotal) > 0.01;

  async function onSubmit(data) {
    setError("");
    if (lineItems.length === 0) { setError("Add at least one line item"); return; }
    if (!storeId) { setError("No store selected"); return; }

    if (!splitPayment && !singlePaymentMethod) {
      setSinglePaymentError("Required");
      setError("Required fields missing: Payment Method");
      return;
    }
    setSinglePaymentError("");

    if (splitPayment) {
      const sum = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      if (Math.abs(sum - grandTotal) > 0.01) {
        setError(`Payments must add up to the grand total (${fmt(grandTotal)}). Current sum: ${fmt(sum)}`);
        return;
      }
    }

    const hasUnsaved = lineItems.some((li) => li.item_id && li._editingItem);
    if (hasUnsaved) {
      const proceed = window.confirm(
        "Some item edits have not been saved to inventory. Create the invoice anyway?"
      );
      if (!proceed) return;
    }

    try {
      await createMutation.mutateAsync({
        ...data,
        store_id: storeId,
        salesman: data.salesman || null,
        delivery_street: data.delivery_street || null,
        delivery_city: data.delivery_city || null,
        delivery_zip: data.delivery_zip || null,
        delivery_state: data.delivery_state || null,
        invoice_date: data.invoice_date ? new Date(data.invoice_date).toISOString() : null,
        is_split_payment: splitPayment,
        payment_method: splitPayment ? null : singlePaymentMethod || null,
        payment_1_method: splitPayment ? payments[0].method || null : null,
        payment_1_amount: splitPayment ? parseFloat(payments[0].amount) || null : null,
        payment_2_method: splitPayment ? payments[1].method || null : null,
        payment_2_amount: splitPayment ? parseFloat(payments[1].amount) || null : null,
        payment_3_method: splitPayment ? payments[2].method || null : null,
        payment_3_amount: splitPayment ? parseFloat(payments[2].amount) || null : null,
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
          brand: li.brand || null,
          quantity: Number(li.quantity),
          unit_price: parseFloat(li.unit_price),
          warranty_term: li.warranty_term,
          warranty_price: li.warranty_price,
          warranty_id: li.warranty_id,
          warranty_provider: li.warranty_provider,
        })),
      });
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (Array.isArray(detail)) {
        const msgs = detail.map((d) => `${d.loc?.at(-1) || "field"}: ${d.msg}`).join("; ");
        setError(`Failed to create invoice — ${msgs}`);
      } else {
        setError(detail || "Failed to create invoice");
      }
    }
  }

  function onFormError(formErrors) {
    const missing = Object.keys(formErrors)
      .map((k) => FIELD_LABELS[k] || k.replace(/_/g, " "))
      .join(", ");
    setError(`Required fields missing: ${missing}`);
  }

  const fmt = (n) =>
    `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const inp = "border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300";
  const roVal = "text-xs text-gray-700 px-1 py-1 leading-tight";
  const fieldCls = "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  const errCls = "border-red-400";

  return (
    <div className="max-w-7xl">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate("/invoices")} className="text-gray-500 hover:text-gray-700 text-sm">
          ← Back
        </button>
        <h2 className="text-xl font-semibold text-gray-800">New Invoice</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-5">
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
                className={`${fieldCls}${errors.customer_name ? ` ${errCls}` : ""}`}
              />
              {errors.customer_name && (
                <p className="text-red-500 text-xs mt-0.5">{errors.customer_name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input {...register("customer_phone")} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input
                {...register("customer_email", { required: "Required" })}
                type="email"
                className={`${fieldCls}${errors.customer_email ? ` ${errCls}` : ""}`}
              />
              {errors.customer_email && (
                <p className="text-red-500 text-xs mt-0.5">{errors.customer_email.message}</p>
              )}
            </div>

            {/* Delivery address — structured */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Street *</label>
              <input
                {...register("delivery_street", { required: "Required" })}
                className={`${fieldCls}${errors.delivery_street ? ` ${errCls}` : ""}`}
                placeholder="123 Main St"
              />
              {errors.delivery_street && (
                <p className="text-red-500 text-xs mt-0.5">{errors.delivery_street.message}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
              <input
                {...register("delivery_city", { required: "Required" })}
                className={`${fieldCls}${errors.delivery_city ? ` ${errCls}` : ""}`}
              />
              {errors.delivery_city && (
                <p className="text-red-500 text-xs mt-0.5">{errors.delivery_city.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State *</label>
                <input
                  {...register("delivery_state", { required: "Required" })}
                  className={`${fieldCls}${errors.delivery_state ? ` ${errCls}` : ""}`}
                  placeholder="CA"
                />
                {errors.delivery_state && (
                  <p className="text-red-500 text-xs mt-0.5">{errors.delivery_state.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Zip *</label>
                <input
                  {...register("delivery_zip", { required: "Required" })}
                  className={`${fieldCls}${errors.delivery_zip ? ` ${errCls}` : ""}`}
                  placeholder="90210"
                />
                {errors.delivery_zip && (
                  <p className="text-red-500 text-xs mt-0.5">{errors.delivery_zip.message}</p>
                )}
              </div>
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
                              <span className={`${roVal} w-52 block`}>{li.description || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.description}
                                onChange={(e) => updateLine(idx, "description", e.target.value)}
                                className={`${inp} w-52`}
                                placeholder="Description"
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1">
                            {locked ? (
                              <span className={`${roVal} w-24 block`}>{li.brand || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.brand}
                                onChange={(e) => updateLine(idx, "brand", e.target.value)}
                                className={`${inp} w-24`}
                                placeholder="Brand"
                              />
                            )}
                          </td>
                          <td className="pr-2 pt-2 pb-1">
                            {locked ? (
                              <span className={`${roVal} w-36 block font-mono`}>{li.model_number || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.model_number}
                                onChange={(e) => updateLine(idx, "model_number", e.target.value)}
                                className={`${inp} w-36 font-mono`}
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
                              <span className={`${roVal} w-36 block font-mono`}>{li.mfr_serial || <span className="text-gray-300">—</span>}</span>
                            ) : (
                              <input
                                value={li.mfr_serial}
                                onChange={(e) => updateLine(idx, "mfr_serial", e.target.value)}
                                className={`${inp} w-36 font-mono`}
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
                          <td colSpan={10} className="pb-2 pr-2">
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
                                  placeholder="1year"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-gray-500">
                                Warranty Price
                                <span className="text-xs text-gray-400">$</span>
                                <input
                                  value={(li.warranty_price || "").replace(/^\$/, "")}
                                  onChange={(e) =>
                                    updateLine(idx, "warranty_price", `$${e.target.value}`)
                                  }
                                  className={`${inp} w-14`}
                                  placeholder="0"
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
                                <select
                                  value={li.warranty_provider}
                                  onChange={(e) => updateLine(idx, "warranty_provider", e.target.value)}
                                  className={`${inp} w-28`}
                                >
                                  {WARRANTY_PROVIDERS.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
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

        {/* Other Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="font-semibold text-gray-700 mb-3">Other Info</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salesman</label>
              <input {...register("salesman")} className={fieldCls} placeholder="Name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
              <input
                {...register("invoice_date", { required: "Required" })}
                type="date"
                className={`${fieldCls}${errors.invoice_date ? ` ${errCls}` : ""}`}
              />
              {errors.invoice_date && (
                <p className="text-red-500 text-xs mt-0.5">{errors.invoice_date.message}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Other Services (Non-Appliance)?
              </label>
              <select
                {...register("has_non_appliance_services")}
                className={fieldCls}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Non-Appliance Description
              </label>
              <input {...register("non_appliance_description")} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tax Rate (%) *</label>
              <input
                {...register("tax_rate")}
                type="number"
                min="0"
                step="0.01"
                className={fieldCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Fee ($) *</label>
              <input
                {...register("delivery_fee")}
                type="number"
                min="0"
                step="0.01"
                className={fieldCls}
              />
            </div>
            <div className="col-span-2">
              <div className="text-sm text-gray-700">
                Grand Total:{" "}
                <span className="font-semibold text-gray-900">{fmt(grandTotal)}</span>
                {subtotal > 0 && (
                  <span className="text-xs text-gray-400 ml-2">
                    (Subtotal {fmt(subtotal)}{taxAmount > 0 ? ` + Tax ${fmt(taxAmount)}` : ""}{parseFloat(watchDeliveryFee) > 0 ? ` + Delivery ${fmt(parseFloat(watchDeliveryFee))}` : ""})
                  </span>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                {...register("notes")}
                rows={2}
                className={fieldCls}
              />
            </div>
          </div>
        </div>

        {/* Payment Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="font-semibold text-gray-700 mb-3">Payment Information</h3>

          {/* Toggle */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-gray-600">Separate Payment?</span>
            <button
              type="button"
              onClick={() => {
                setSplitPayment((v) => !v);
                setSinglePaymentError("");
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                splitPayment ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  splitPayment ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-500">{splitPayment ? "Yes" : "No"}</span>
          </div>

          {!splitPayment && (
            <p className="text-xs text-gray-500 mb-3">
              Payment amount will be Paid-in-Full (Grand Total: {fmt(grandTotal)}).
            </p>
          )}

          {!splitPayment ? (
            <div className="max-w-xs">
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method *</label>
              <select
                value={singlePaymentMethod}
                onChange={(e) => {
                  setSinglePaymentMethod(e.target.value);
                  if (e.target.value) setSinglePaymentError("");
                }}
                className={`${fieldCls}${singlePaymentError ? ` ${errCls}` : ""}`}
              >
                <option value="">— Select —</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {singlePaymentError && (
                <p className="text-red-500 text-xs mt-0.5">{singlePaymentError}</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                {payments.map((p, i) => (
                  <div key={i} className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">Payment {i + 1}</p>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Method *</label>
                      <select
                        value={p.method}
                        onChange={(e) =>
                          setPayments((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, method: e.target.value } : x))
                          )
                        }
                        className={fieldCls}
                      >
                        <option value="">— Select —</option>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount ($) *</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={p.amount}
                        onChange={(e) =>
                          setPayments((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))
                          )
                        }
                        className={fieldCls}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {splitError && (
                <p className="text-red-500 text-xs mt-2">
                  Payments must add up to the grand total ({fmt(grandTotal)}). Current sum: {fmt(splitSum)}.
                </p>
              )}
            </>
          )}
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
