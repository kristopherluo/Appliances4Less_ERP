import { useEffect } from "react";
import { useForm } from "react-hook-form";
import api from "../lib/api";

const APPLIANCE_TYPES = [
  "Washer", "Dryer", "Refrigerator", "Dishwasher", "Range", "Oven",
  "Microwave", "Freezer", "AC Unit", "Other",
];

export default function ItemModal({ item, stores, defaultStoreId, onClose, onSaved, onDelete }) {
  const isEdit = !!item;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (item) {
      reset({
        ...item,
        load_date: item.load_date ? item.load_date.slice(0, 10) : "",
      });
    } else {
      reset({ store_id: defaultStoreId, is_in_stock: true, cost_price: "", sale_price: "" });
    }
  }, [item]);

  async function onSubmit(data) {
    const payload = {
      ...data,
      store_id: Number(data.store_id),
      cost_price: parseFloat(data.cost_price),
      sale_price: parseFloat(data.sale_price),
      is_in_stock: data.is_in_stock === true || data.is_in_stock === "true",
      load_date: data.load_date || null,
    };
    if (isEdit) {
      await api.patch(`/inventory/${item.id}`, payload);
    } else {
      await api.post("/inventory/", payload);
    }
    onSaved();
  }

  const field = (label, name, opts = {}) => {
    const { type, step, min, max, ...rhfOpts } = opts;
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
        <input
          {...register(name, rhfOpts)}
          className={`w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${errors[name] ? "border-red-400" : "border-gray-300"}`}
          {...(type && { type })}
          {...(step && { step })}
          {...(min !== undefined && { min })}
          {...(max !== undefined && { max })}
        />
        {errors[name] && <p className="text-red-500 text-xs mt-0.5">{errors[name].message}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? "Edit Item" : "Add Item"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Store (admin only) */}
          {stores.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Store</label>
              <select {...register("store_id", { required: true })} className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {field("A/C Code", "ac_code")}
            {field("KW Code", "kw_code")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Appliance Type</label>
              <select {...register("appliance_type")} className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Select type —</option>
                {APPLIANCE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {field("Brand", "brand")}
          </div>

          {field("Details", "name", { required: "Required" })}

          <div className="grid grid-cols-2 gap-3">
            {field("Model Name", "model_name")}
            {field("Model Number", "model_number")}
          </div>

          {field("Serial Number", "serial_number")}

          <div className="grid grid-cols-2 gap-3">
            {field("Grade", "grade")}
            {field("Location", "location")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field("Load #", "load_number")}
            {field("Load Date", "load_date", { type: "date" })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field("Cost Price ($)", "cost_price", { required: "Required", type: "number", step: "0.01", min: "0" })}
            {field("Sale Price ($)", "sale_price", { required: "Required", type: "number", step: "0.01", min: "0" })}
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_in_stock" {...register("is_in_stock")} className="w-4 h-4 accent-blue-600" />
            <label htmlFor="is_in_stock" className="text-sm text-gray-700">In Stock</label>
          </div>

          <div className="flex justify-between items-center pt-2">
            <div>
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                      onDelete(item);
                    }
                  }}
                  className="px-4 py-2 text-sm bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50">
                {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
