import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../context/StoreContext";
import StoreModal from "./StoreModal";
import api from "../lib/api";

export default function LocationsModal({ onClose }) {
  const { stores } = useStore();
  const queryClient = useQueryClient();
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/stores/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      setConfirmDeleteId(null);
    },
  });

  function openEdit(s) {
    setEditingStore(s);
    setShowStoreModal(true);
  }

  function openAdd() {
    setEditingStore(null);
    setShowStoreModal(true);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Manage Locations</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {stores.length === 0 && (
              <p className="px-5 py-4 text-sm text-gray-400">No locations yet</p>
            )}
            {stores.map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm text-gray-800">{s.name}</p>
                  {s.address && <p className="text-xs text-gray-500">{s.address}</p>}
                  {s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {confirmDeleteId === s.id ? (
                    <>
                      <span className="text-xs text-gray-500">Delete?</span>
                      <button
                        onClick={() => deleteMutation.mutate(s.id)}
                        disabled={deleteMutation.isPending}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-gray-500 hover:underline text-xs"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openEdit(s)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100">
            <button
              onClick={openAdd}
              className="text-blue-700 text-sm font-medium hover:underline"
            >
              + Add Location
            </button>
          </div>
        </div>
      </div>

      {showStoreModal && (
        <StoreModal
          store={editingStore}
          onClose={() => setShowStoreModal(false)}
        />
      )}
    </>
  );
}
