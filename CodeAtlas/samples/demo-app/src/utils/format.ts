export function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function formatMoney(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

export function unusedHelper(value: string): string {
  return value.trim().toLowerCase();
}

export function legacyFormat(value: number): string {
  return String(value).padStart(4, "0");
}
