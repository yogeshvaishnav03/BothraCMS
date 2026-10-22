/** Small fetch helpers for client pages that talk to our JSON API. */

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message || "Something went wrong");
  return json.data as T;
}

const send = (method: string) => (body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const post = send("POST");
export const patch = send("PATCH");
export const put = send("PUT");

/** Rupees typed in a form → paise for the API. */
export const toPaise = (rupees: string | number) => Math.round(Number(rupees || 0) * 100);

export function shortDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
}

export function rupees(paise: number | null | undefined) {
  return `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
