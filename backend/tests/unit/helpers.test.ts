// Unit tests for pure helpers — fast, no server, no database. These guard the
// small functions that are easy to regress silently (formatting, language
// detection, path normalization). Run with: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { posix } from "../../server/analyze/crawl";
import { detectLanguage, isSourceLanguage } from "../../server/analyze/lang";
import { clusterOf } from "../../server/analyze/pipeline";
import { plural } from "../../../shared/format";

test("posix normalizes Windows separators to forward slashes", () => {
  assert.equal(posix("server\\db\\users.ts"), "server/db/users.ts");
  assert.equal(posix("already/unix/path.ts"), "already/unix/path.ts");
});

test("detectLanguage maps extensions and special filenames", () => {
  assert.equal(detectLanguage("src/main.ts"), "TypeScript");
  assert.equal(detectLanguage("src/Component.tsx"), "TypeScript");
  assert.equal(detectLanguage("server/db/users.ts"), "TypeScript");
  assert.equal(detectLanguage("scripts/tool.py"), "Python");
  assert.equal(detectLanguage("Dockerfile"), "Docker");
  assert.equal(detectLanguage("README"), "Other");
  assert.equal(detectLanguage("archive.xyz"), "Other");
});

test("isSourceLanguage classifies code languages vs assets", () => {
  assert.equal(isSourceLanguage("TypeScript"), true);
  assert.equal(isSourceLanguage("Python"), true);
  assert.equal(isSourceLanguage("Other"), false);
  assert.equal(isSourceLanguage("Docker"), false);
});

test("plural renders singular, plural and thousands separators", () => {
  assert.equal(plural(1, "file"), "1 file");
  assert.equal(plural(3, "file"), "3 files");
  // toLocaleString is locale-dependent; compare against the same call used by
  // the implementation so the assertion holds on every CI locale.
  assert.equal(plural(1200, "entry", "entries"), `${(1200).toLocaleString()} entries`);
  assert.equal(plural(2, "child", "children"), "2 children");
});

test("clusterOf derives the module cluster from a path", () => {
  assert.equal(clusterOf("server/db/users.ts", "server"), "db");
  assert.equal(clusterOf("server/db/users.ts", null), "server");
  assert.equal(clusterOf("users.ts", null), "(root)");
  assert.equal(clusterOf("src/users.ts", "src"), "(root)");
});
