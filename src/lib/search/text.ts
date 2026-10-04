// Pure helpers shared by the search queries (server) and the result UI
// (server + client). No imports, so tests can load this file directly.

export const MAX_QUERY_LENGTH = 100;
const MAX_TERMS = 6;

export const SEARCH_TYPES = ["projects", "pages", "comparisons", "comments"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export function isSearchType(value: unknown): value is SearchType {
  return typeof value === "string" && (SEARCH_TYPES as readonly string[]).includes(value);
}

// Splits a query into distinct, case-insensitive words. Each word has to
// match somewhere for a row to count, so "acme pricing" finds the Pricing
// page in the Acme project rather than requiring that exact phrase.
export function tokenize(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.slice(0, MAX_QUERY_LENGTH).split(/\s+/)) {
    const term = raw.trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

// Escapes LIKE/ILIKE wildcards so a search for "50%" or "hero_image"
// matches those characters literally. Postgres' default escape is "\".
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type TextSegment = { text: string; match: boolean };

// Splits text into matched / unmatched runs for highlighting.
export function highlightSegments(text: string, terms: string[]): TextSegment[] {
  if (!text) return [];
  const usable = terms.filter(Boolean);
  if (usable.length === 0) return [{ text, match: false }];

  // Longest first so "pricing" wins over "pri" when both are terms.
  const pattern = new RegExp(
    `(${[...usable].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`,
    "gi"
  );
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const found of text.matchAll(pattern)) {
    const index = found.index ?? 0;
    if (index > lastIndex) segments.push({ text: text.slice(lastIndex, index), match: false });
    segments.push({ text: found[0], match: true });
    lastIndex = index + found[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), match: false });
  return segments;
}

// A window of `text` centred on the first matching term, so a hit deep
// inside a long comment is still visible in a one-line result.
export function snippet(text: string, terms: string[], radius = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= radius * 2) return flat;

  const lower = flat.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index !== -1 && (first === -1 || index < first)) first = index;
  }
  if (first === -1) return `${flat.slice(0, radius * 2).trimEnd()}…`;

  const start = Math.max(0, first - radius);
  const end = Math.min(flat.length, first + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}
