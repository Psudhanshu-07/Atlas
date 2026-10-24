// Deprecated in 2023 — superseded by services/reportService.ts, kept "just in case".

interface RawCsvRow {
  [key: string]: string;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function parseCsv(text: string): RawCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: RawCsvRow = {};
    header.forEach((key, idx) => {
      row[key] = cells[idx] ?? "";
    });
    return row;
  });
}

export function toTsv(rows: RawCsvRow[]): string {
  const header = Object.keys(rows[0] ?? {});
  const body = rows.map((row) => header.map((key) => row[key]).join("\t"));
  return [header.join("\t"), ...body].join("\n");
}
