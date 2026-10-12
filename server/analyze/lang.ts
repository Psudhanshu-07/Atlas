// Language detection + import/export extraction for every supported language.
// JS/TS family is parsed with the real TypeScript compiler API; everything else
// uses tuned line-oriented parsers that are accurate enough for architecture maps.

import ts from "typescript";

export interface RawImport {
  raw: string;
  line: number;
  names: string[];
  all: boolean;
}

export interface RawExport {
  name: string;
  line: number;
  kind: string;
}

export interface ExtractResult {
  imports: RawImport[];
  exports: RawExport[];
  definitions: number;
  commentLines: number;
}

const EXT_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".pyi": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".scala": "Scala",
  ".cs": "C#",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".c": "C",
  ".h": "C/C++",
  ".cpp": "C++",
  ".cc": "C++",
  ".hpp": "C/C++",
  ".hh": "C/C++",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".dart": "Dart",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".lua": "Lua",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".ps1": "PowerShell",
  ".sql": "SQL",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "Less",
  ".html": "HTML",
  ".htm": "HTML",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
  ".mdx": "Markdown",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".proto": "Protobuf",
  ".tf": "Terraform",
  ".dockerfile": "Docker",
  ".xml": "XML",
  ".gradle": "Gradle",
  ".r": "R",
  ".jl": "Julia",
};

export const LANG_COLOR: Record<string, string> = {
  TypeScript: "#3b82f6",
  JavaScript: "#eab308",
  Python: "#38bdf8",
  Go: "#22d3ee",
  Rust: "#f97316",
  Java: "#ef4444",
  Kotlin: "#a855f7",
  Scala: "#e11d48",
  "C#": "#a78bfa",
  Ruby: "#f43f5e",
  PHP: "#8b5cf6",
  Swift: "#fb7185",
  C: "#94a3b8",
  "C/C++": "#94a3b8",
  "C++": "#94a3b8",
  Vue: "#4ade80",
  Svelte: "#ff8a65",
  Dart: "#06b6d4",
  Elixir: "#c084fc",
  Lua: "#60a5fa",
  Shell: "#34d399",
  PowerShell: "#60a5fa",
  SQL: "#fbbf24",
  CSS: "#f472b6",
  SCSS: "#f472b6",
  Less: "#f472b6",
  HTML: "#fb923c",
  JSON: "#a3e635",
  YAML: "#fda4af",
  TOML: "#d4d4d8",
  Markdown: "#e2e8f0",
  GraphQL: "#ec4899",
  Protobuf: "#facc15",
  Terraform: "#818cf8",
  Docker: "#0ea5e9",
  XML: "#f97316",
  Gradle: "#22d3ee",
  R: "#60a5fa",
  Julia: "#9f7aea",
  Other: "#64748b",
};

export const CODE_LANGUAGES = new Set([
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "Kotlin",
  "Scala",
  "C#",
  "Ruby",
  "PHP",
  "Swift",
  "C",
  "C/C++",
  "C++",
  "Vue",
  "Svelte",
  "Dart",
  "Elixir",
  "Lua",
  "Shell",
  "PowerShell",
  "SQL",
  "GraphQL",
  "Protobuf",
  "Terraform",
  "R",
  "Julia",
]);

/** Extension → language name. */
export function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (base === "dockerfile") return "Docker";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "Other";
  return EXT_LANG[base.slice(dot)] ?? "Other";
}

/** File extensions considered source code (drive module graph + clusters). */
export function isSourceLanguage(lang: string): boolean {
  return CODE_LANGUAGES.has(lang);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function extractJsTs(filePath: string, text: string): ExtractResult {
  const lower = filePath.toLowerCase();
  const kind = lower.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : lower.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];
  const pushImport = (raw: string, line: number, names: string[] = [], all = false) => {
    if (!raw) return;
    if (!imports.some((i) => i.raw === raw && i.line === line)) {
      imports.push({ raw, line, names, all });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: string[] = [];
      let all = false;
      const clause = node.importClause;
      if (clause?.name) names.push("default");
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          names.push((el.propertyName ?? el.name).text);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        all = true;
      }
      pushImport(node.moduleSpecifier.text, lineOf(sf, node), names, all);
    }

    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const names: string[] = [];
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            names.push((el.propertyName ?? el.name).text);
          }
        } else {
          names.push("*");
        }
        pushImport(node.moduleSpecifier.text, lineOf(sf, node), names, node.exportClause === undefined);
      } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          exports.push({ name: el.name.text, line: lineOf(sf, el), kind: "re-export" });
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isRequire =
        ts.isIdentifier(callee) && callee.text === "require" && node.arguments.length > 0;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0;
      if ((isRequire || isDynamicImport) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        pushImport(node.arguments[0].text, lineOf(sf, node));
      }
    }

    const isExported = (n: ts.Node): boolean =>
      ts.canHaveModifiers(n) && (ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);

    if (isExported(node)) {
      const line = lineOf(sf, node);
      if (ts.isFunctionDeclaration(node)) {
        exports.push({ name: node.name?.text ?? "default", line, kind: "function" });
      } else if (ts.isClassDeclaration(node)) {
        exports.push({ name: node.name?.text ?? "default", line, kind: "class" });
      } else if (ts.isInterfaceDeclaration(node)) {
        exports.push({ name: node.name.text, line, kind: "interface" });
      } else if (ts.isTypeAliasDeclaration(node)) {
        exports.push({ name: node.name.text, line, kind: "type" });
      } else if (ts.isEnumDeclaration(node)) {
        exports.push({ name: node.name.text, line, kind: "enum" });
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            exports.push({ name: decl.name.text, line, kind: "value" });
          }
        }
      } else if (ts.isModuleDeclaration(node) && node.name && ts.isStringLiteral(node.name)) {
        exports.push({ name: node.name.text, line, kind: "module" });
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  // export default expression (no declaration name)
  for (const stmt of sf.statements) {
    if (ts.isExportAssignment(stmt)) {
      exports.push({ name: "default", line: lineOf(sf, stmt), kind: "default" });
    }
  }

  return {
    imports,
    exports,
    definitions: countMatches(text, /\b(function|class|def|const|let|var|interface|type)\b/g),
    commentLines: countJsComments(text),
  };
}

function countMatches(text: string, re: RegExp): number {
  let n = 0;
  for (const _ of text.matchAll(re)) n++;
  return n;
}

function countJsComments(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) n++;
  }
  return n;
}

function lineCommentCount(text: string, markers: string[]): number {
  let n = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (markers.some((m) => t.startsWith(m))) n++;
  }
  return n;
}

function extractPython(text: string): ExtractResult {
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    const m1 = line.match(/^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?/);
    if (m1) imports.push({ raw: m1[1], line: idx + 1, names: [], all: true });
    const m2 = line.match(/^\s*from\s+([\w.]+)\s+import\s+(.+)$/);
    if (m2) {
      const target = m2[1];
      const rest = m2[2].trim();
      if (rest === "*") {
        imports.push({ raw: target, line: idx + 1, names: [], all: true });
      } else {
        const names = rest
          .replace(/^\(/, "")
          .split(",")
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter((s) => /^[A-Za-z_]\w*$/.test(s));
        imports.push({ raw: target, line: idx + 1, names, all: false });
      }
    }
    const d = line.match(/^(?:async\s+)?def\s+(\w+)/);
    if (d) exports.push({ name: d[1], line: idx + 1, kind: "function" });
    const c = line.match(/^class\s+(\w+)/);
    if (c) exports.push({ name: c[1], line: idx + 1, kind: "class" });
  });
  return {
    imports,
    exports,
    definitions: countMatches(text, /^\s*(?:async\s+)?(?:def|class)\s/gm),
    commentLines: lineCommentCount(text, ["#", '"""', "'''"]),
  };
}

function extractGo(text: string): ExtractResult {
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];
  const lines = text.split("\n");
  let inBlock = false;
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (/^import\s*\($/.test(t)) {
      inBlock = true;
      return;
    }
    if (inBlock && t === ")") {
      inBlock = false;
      return;
    }
    if (inBlock) {
      const m = t.match(/^"([^"]+)"/) || t.match(/^\w+\s+"([^"]+)"/);
      if (m) imports.push({ raw: m[1], line: idx + 1, names: [], all: true });
      return;
    }
    const single = t.match(/^import\s+(?:\w+\s+)?"([^"]+)"/);
    if (single) imports.push({ raw: single[1], line: idx + 1, names: [], all: true });
    const fn = line.match(/^func\s+(?:\([^)]*\)\s+)?([A-Z]\w*)/);
    if (fn) exports.push({ name: fn[1], line: idx + 1, kind: "func" });
    const ty = line.match(/^type\s+([A-Z]\w*)/);
    if (ty) exports.push({ name: ty[1], line: idx + 1, kind: "type" });
  });
  return {
    imports,
    exports,
    definitions: countMatches(text, /^func\s/gm),
    commentLines: lineCommentCount(text, ["//"]),
  };
}

function extractRust(text: string): ExtractResult {
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    const use = line.match(/^\s*use\s+([\w:]+)(?:::\{?.*)?/);
    if (use) imports.push({ raw: use[1], line: idx + 1, names: [], all: true });
    const mod = line.match(/^\s*mod\s+(\w+)\s*;?/);
    if (mod) imports.push({ raw: mod[1], line: idx + 1, names: [], all: true });
    const pub = line.match(/^\s*pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/);
    if (pub) exports.push({ name: pub[1], line: idx + 1, kind: "item" });
  });
  return {
    imports,
    exports,
    definitions: countMatches(text, /\b(fn|struct|enum|trait)\b/g),
    commentLines: lineCommentCount(text, ["//", "///", "//!"]),
  };
}

/** Java-like languages (Java, C#, Kotlin, Scala) + PHP/Ruby/C-family. */
function extractGeneric(lang: string, filePath: string, text: string): ExtractResult {
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];
  const lines = text.split("\n");
  const base = filePath.split("/").pop() ?? "";

  lines.forEach((line, idx) => {
    const t = line.trim();
    if (lang === "Java" || lang === "Kotlin" || lang === "Scala" || lang === "C#") {
      const m = t.match(/^import\s+(?:static\s+)?([\w.]+(?:\.\*)?);?/);
      if (m) imports.push({ raw: m[1], line: idx + 1, names: [], all: true });
      const decl = t.match(
        /^\s*(?:public\s+|internal\s+)?(?:abstract\s+|final\s+|sealed\s+|static\s+)*(?:class|interface|enum|record|object)\s+(\w+)/,
      );
      if (decl) exports.push({ name: decl[1], line: idx + 1, kind: "type" });
    } else if (lang === "Ruby") {
      const rel = t.match(/^require_relative\s+['"]([^'"]+)['"]/);
      if (rel) imports.push({ raw: `./${rel[1]}`, line: idx + 1, names: [], all: true });
      const req = t.match(/^require\s+['"]([^'"]+)['"]/);
      if (req) imports.push({ raw: req[1], line: idx + 1, names: [], all: true });
      const def = t.match(/^\s*(?:def\s+self\.)?def\s+(\w+[?!]?)/);
      if (def && t.startsWith("def")) exports.push({ name: def[1], line: idx + 1, kind: "method" });
      const cls = t.match(/^\s*class\s+([A-Z]\w*)/);
      if (cls) exports.push({ name: cls[1], line: idx + 1, kind: "class" });
    } else if (lang === "PHP") {
      const use = t.match(/^use\s+([\w\\]+);/);
      if (use) imports.push({ raw: use[1].replace(/\\/g, "/"), line: idx + 1, names: [], all: true });
      const req = t.match(/(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/);
      if (req) imports.push({ raw: req[1], line: idx + 1, names: [], all: true });
      const cls = t.match(/^\s*(?:final\s+|abstract\s+)?class\s+(\w+)/);
      if (cls) exports.push({ name: cls[1], line: idx + 1, kind: "class" });
      const fn = t.match(/^\s*function\s+(\w+)/);
      if (fn) exports.push({ name: fn[1], line: idx + 1, kind: "function" });
    } else if (lang === "Swift" || lang === "Dart" || lang === "Lua" || lang === "Elixir" || lang === "R" || lang === "Julia") {
      const imp = t.match(/^\s*(?:import|use|using|local\s+require)\s+["<]?([\w./:]+)[">]?/);
      if (imp) imports.push({ raw: imp[1], line: idx + 1, names: [], all: true });
      const rel = t.match(/^\s*(?:local\s+)?require\s*\(?\s*["']([^'"]+)["']/);
      if (rel) imports.push({ raw: rel[1], line: idx + 1, names: [], all: true });
      const decl = t.match(/^\s*(?:public\s+|private\s+|internal\s+)?(?:func|fn|def|function|struct|class|protocol|trait)\s+(\w+)/);
      if (decl) exports.push({ name: decl[1], line: idx + 1, kind: "def" });
    } else if (lang === "C" || lang === "C/C++" || lang === "C++") {
      const local = t.match(/^#\s*include\s+"([^"]+)"/);
      if (local) imports.push({ raw: local[1], line: idx + 1, names: [], all: true });
      const sys = t.match(/^#\s*include\s+<([^>]+)>/);
      if (sys) imports.push({ raw: sys[1], line: idx + 1, names: [], all: true });
      if (base.endsWith(".h") || base.endsWith(".hpp") || base.endsWith(".hh")) {
        const decl = t.match(/^(?:class|struct)\s+(\w+)/);
        if (decl) exports.push({ name: decl[1], line: idx + 1, kind: "type" });
      }
    } else if (lang === "Shell" || lang === "PowerShell") {
      const src = t.match(/^\s*(?:source|\.)\s+["']?([^\s"']+)/);
      if (src) imports.push({ raw: src[1], line: idx + 1, names: [], all: true });
      const fn = t.match(/^\s*(?:function\s+)?([A-Za-z_]\w*)\s*\(\)/);
      if (fn) exports.push({ name: fn[1], line: idx + 1, kind: "function" });
    } else if (lang === "SQL" || lang === "GraphQL" || lang === "Terraform" || lang === "Protobuf" || lang === "Vue" || lang === "Svelte") {
      const m = t.match(/^(?:import|from|use)\s+["']([^"']+)["']/);
      if (m) imports.push({ raw: m[1], line: idx + 1, names: [], all: true });
      const m2 = t.match(/^(?:export\s+)?(?:const|let|function|class|module\.exports)\s+(\w+)/);
      if (m2) exports.push({ name: m2[1], line: idx + 1, kind: "value" });
    }
  });

  return {
    imports,
    exports,
    definitions:
      countMatches(text, /\b(class|struct|def|func|function|func)\b/g) || exports.length,
    commentLines: lineCommentCount(text, ["//", "#", "*", "/*", "--"]),
  };
}

/** Parse a single file and pull out imports, exports and simple complexity signals. */
export function extract(filePath: string, language: string, text: string): ExtractResult {
  try {
    switch (language) {
      case "TypeScript":
      case "JavaScript":
        return extractJsTs(filePath, text);
      case "Python":
        return extractPython(text);
      case "Go":
        return extractGo(text);
      case "Rust":
        return extractRust(text);
      case "Vue":
      case "Svelte": {
        // Script block first, then fall back to whole-file scanning.
        const script = text.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? text;
        const res = extractJsTs(filePath, script);
        return res;
      }
      case "Markdown":
      case "JSON":
      case "YAML":
      case "TOML":
      case "CSS":
      case "SCSS":
      case "Less":
      case "HTML":
      case "XML":
      case "Other":
        return { imports: [], exports: [], definitions: 0, commentLines: 0 };
      default:
        return extractGeneric(language, filePath, text);
    }
  } catch {
    return { imports: [], exports: [], definitions: 0, commentLines: 0 };
  }
}
