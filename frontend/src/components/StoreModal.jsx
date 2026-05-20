import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";

export default function StoreModal({ store, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!store;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name: "", address: "", phone: "" },
  });

  useEffect(() => {
    reset({
      name: store?.name || "",
      address: store?.address || "",
      phone: store?.phone || "",
    });
  }, [store]);

  const saveMutation = useMutation({
    mutationFn: (data) =>
      isEdit
        ? api.patch(`/stores/${store.id}`, data)
        : api.post("/stores/", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stores"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800">{isEdit ? "Edit Location" : "Add Location"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form
          onSubmit={handleSubmit((data) => saveMutation.mutateAsync(data))}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input
              {...register("name", { required: "Required" })}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Main St, Warehouse"
            />
            {errors.name && <p className="text-red-500 text-xs mt-0.5">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <textarea
              {...register("address")}
              rows={2}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="123 Main St, City, State ZIP"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input
              {...register("phone")}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="(555) 000-0000"
            />
          </div>
          {saveMutation.isError && (
            <p className="text-red-500 text-xs">
              {saveMutation.error?.response?.data?.detail || "Save failed"}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-sm bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
