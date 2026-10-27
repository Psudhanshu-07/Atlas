// One-off audit: list exported top-level symbols with no references in any
// other file of the source tree. Heuristic token counting — every candidate
// is manually reviewed before removal. Usage: node tools/find-dead-exports.mjs
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.argv[2] ?? ".";
const DIRS = ["backend", "frontend/src", "shared", "samples/demo-app/src"];
const EXTS = new Set([".ts", ".tsx"]);

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".codeatlas") continue;
      out = out.concat(walk(p));
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));

// Map: symbol name -> [{ file, line, kind }]
const exports = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  const re = /\bexport\s+(?:(?:async\s+)?function\*?\s+(\w+)|(?:const|let|var)\s+(\w+)|(?:interface|type|enum|class)\s+(\w+))\b/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1] || m[2] || m[3];
    if (!name) continue;
    if (!exports.has(name)) exports.set(name, []);
    exports.get(name).push({ file: rel, line: text.slice(0, m.index).split("\n").length, text: m[0].replace(/\s+/g, " ") });
  }
}

// Occurrences of each symbol per file (token match, skipping export keywords won't be perfect; treat identifier itselef)
for (const [name, defs] of exports) {
  const re = new RegExp(`\\b${name}\\b`, "g");
  let outside = 0;
  const defFiles = new Set(defs.map((d) => d.file));
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (defFiles.has(rel)) continue; // occurrences inside defining files don't prove external use
    const hits = (fs.readFileSync(file, "utf8").match(re) || []).length;
    outside += hits;
  }
  if (outside === 0) {
    for (const d of defs) console.log(`${d.file}:${d.line}: ${d.text}`);
  }
}
