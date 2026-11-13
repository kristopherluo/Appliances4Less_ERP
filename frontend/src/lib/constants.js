export const PAYMENT_METHODS = [
  "American Express",
  "Cash",
  "Check",
  "Debit",
  "Discover",
  "Mastercard",
  "Others",
  "Snap",
  "Venmo",
  "Visa",
  "Zelle",
];

// Old invoices may hold a retired method (Credit, Financing, Other); keep it selectable so editing doesn't blank it.
export function paymentMethodOptions(current) {
  return current && !PAYMENT_METHODS.includes(current) ? [current, ...PAYMENT_METHODS] : PAYMENT_METHODS;
}

export const FULFILLMENT_OPTIONS = [
  { value: "ready_for_pickup", label: "Ready for pick up" },
  { value: "ready_for_delivery", label: "Ready for delivery" },
  { value: "picked_up_delivered", label: "Picked up / Delivered" },
];

export const STATUS_OPTIONS = ["Completed", "Partial paid", "Canceled", "Returned"];

export function invoiceBalance(inv) {
  if (!inv.is_split_payment) return 0;
  const paid = [inv.payment_1_amount, inv.payment_2_amount, inv.payment_3_amount]
    .reduce((s, a) => s + (a ?? 0), 0);
  return Math.max(Number(inv.total_amount) - paid, 0);
}

export function invoiceStatusLabel(inv) {
  if (inv.status === "canceled") return "Canceled";
  if (inv.status === "returned") return "Returned";
  return invoiceBalance(inv) > 0.01 ? "Partial paid" : "Completed";
}
