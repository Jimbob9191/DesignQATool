import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeLike,
  highlightSegments,
  isSearchType,
  snippet,
  tokenize,
} from "../src/lib/search/text.ts";

test("tokenize splits on whitespace and drops duplicates case-insensitively", () => {
  assert.deepEqual(tokenize("  Acme   pricing acme "), ["Acme", "pricing"]);
  assert.deepEqual(tokenize("   "), []);
});

test("tokenize caps the number of terms", () => {
  assert.equal(tokenize("a b c d e f g h").length, 6);
});

test("escapeLike makes wildcards literal", () => {
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  assert.equal(escapeLike("plain"), "plain");
});

test("highlightSegments marks every term, case-insensitively", () => {
  assert.deepEqual(highlightSegments("Acme Pricing page", ["pricing", "acme"]), [
    { text: "Acme", match: true },
    { text: " ", match: false },
    { text: "Pricing", match: true },
    { text: " page", match: false },
  ]);
});

test("highlightSegments treats regex characters literally", () => {
  assert.deepEqual(highlightSegments("a (b) c", ["(b)"]), [
    { text: "a ", match: false },
    { text: "(b)", match: true },
    { text: " c", match: false },
  ]);
});

test("snippet centres long text on the first match", () => {
  const text = `${"x ".repeat(100)}needle${" y".repeat(100)}`;
  const result = snippet(text, ["needle"], 20);
  assert.ok(result.startsWith("…"));
  assert.ok(result.endsWith("…"));
  assert.ok(result.includes("needle"));
});

test("snippet leaves short text alone", () => {
  assert.equal(snippet("short   comment", ["x"]), "short comment");
});

test("isSearchType only accepts known types", () => {
  assert.equal(isSearchType("pages"), true);
  assert.equal(isSearchType("assets"), false);
  assert.equal(isSearchType(["pages"]), false);
});
