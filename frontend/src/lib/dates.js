const TZ = "America/Chicago";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The API returns naive UTC timestamps (no "Z"); without it the browser reads them as local time.
export function parseServerTime(s) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

export function centralYmd(date) {
  return ymdFormatter.format(date);
}

export const todayCentral = () => centralYmd(new Date());

export function monthRangeCentral() {
  const [y, m] = todayCentral().split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay)}` };
}

// invoice_date is a calendar day, so its date part is used as-is.
export function invoiceDay(inv) {
  return inv.invoice_date ? inv.invoice_date.slice(0, 10) : centralYmd(parseServerTime(inv.created_at));
}

export function formatDay(ymd, opts = { month: "short", day: "numeric", year: "numeric" }) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts);
}

export const dayToServer = (ymd) => (ymd ? `${ymd}T00:00:00` : null);

export const isOlderThan24h = (createdAt) =>
  Date.now() - parseServerTime(createdAt).getTime() > 24 * 60 * 60 * 1000;
