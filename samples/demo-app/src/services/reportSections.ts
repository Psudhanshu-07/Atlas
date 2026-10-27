// Report sections. Every section of the weekly report renders the same way:
// a heading, then each of the most recent `limit` orders — skipping blank
// rows — slugified onto its own numbered line. One parameterised renderer
// replaces what used to be 76 copy-pasted `sectionN()` functions with
// identical bodies.

import { slugify } from "../utils/strings";

const ORDER_LINE_SEPARATOR = "\n";

/** Renders one report section: `heading #i <slug-of-order>` per row. */
function renderSection(
  orders: unknown[],
  number: number,
  limit: number,
): string {
  const heading = `Section ${number} of the order report`;
  const rows = orders.slice(0, limit);
  if (rows.length === 0) {
    return `${heading}: empty`;
  }
  // Blank rows are skipped, exactly as the original section formatters did.
  const flags = rows.filter((row) => String(row).length > 0);
  return flags
    .map((row, idx) => `${heading} #${idx} ${slugify(String(row))}`)
    .join(ORDER_LINE_SEPARATOR);
}

/** The sections of the weekly report, in order, with their page sizes. */
const SECTION_DEFS: Array<{ number: number; limit: number }> = [
  { number: 1, limit: 2 },
  { number: 2, limit: 3 },
  { number: 3, limit: 4 },
  { number: 4, limit: 5 },
  { number: 5, limit: 6 },
];

export function reportSections(orders: unknown[]): string[] {
  return SECTION_DEFS.map((section) => renderSection(orders, section.number, section.limit));
}
