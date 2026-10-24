// Number and count formatting shared by the server and the UI.
// One owner so "1 file" never renders as "1 files" in one view and correctly in another.

/** `plural(1, "file")` → `"1 file"`, `plural(3, "file")` → `"3 files"`. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}