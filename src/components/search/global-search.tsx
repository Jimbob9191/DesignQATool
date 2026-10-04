"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, Loader2, Search } from "lucide-react";

import { SEARCH_TYPE_LABELS, type SearchItem } from "@/lib/search/items";
import { MAX_QUERY_LENGTH, SEARCH_TYPES, type SearchType } from "@/lib/search/text";
import { SearchResultRow } from "@/components/search/search-result-row";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// `input` is the text the response was fetched for, so a slow response for
// an older query is never shown as "no matches" for the current one.
type SearchResponse = { input: string; terms: string[]; items: Record<SearchType, SearchItem[]> };

const DEBOUNCE_MS = 150;

function resultsPageHref(query: string) {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}

// Topbar search: live results as you type (⌘K / Ctrl+K or "/" to focus),
// arrow keys + Enter to open one, or Enter with nothing highlighted to see
// every match on /search.
export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const trimmed = value.trim();

  useEffect(() => {
    if (!trimmed) {
      setResponse(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = (await res.json()) as Omit<SearchResponse, "input">;
        setResponse({ ...data, input: trimmed });
        setActiveIndex(-1);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setResponse(null);
      }
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // Close after navigating anywhere, including via a result link.
  useEffect(() => {
    setOpen(false);
    inputRef.current?.blur();
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const groups = useMemo(
    () =>
      response
        ? SEARCH_TYPES.map((type) => ({ type, items: response.items[type] })).filter(
            (group) => group.items.length > 0
          )
        : [],
    [response]
  );
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  // The last keyboard stop is "See all results".
  const seeAllIndex = flatItems.length;
  const showPanel = open && trimmed.length > 0;
  const stale = response?.input !== trimmed;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open && trimmed) {
        setOpen(false);
      } else {
        inputRef.current?.blur();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const count = seeAllIndex + 1;
      setActiveIndex((index) =>
        event.key === "ArrowDown" ? (index + 1) % count : (index - 1 + count) % count
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!trimmed) return;
      const item = activeIndex >= 0 ? flatItems[activeIndex] : undefined;
      go(item ? item.href : resultsPageHref(trimmed));
    }
  }

  let itemIndex = -1;

  return (
    <div ref={containerRef} className="relative max-w-md flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        placeholder="Search projects, pages, comments…"
        maxLength={MAX_QUERY_LENGTH}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="pr-12 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground sm:block">
        ⌘K
      </kbd>

      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1.5 max-h-[min(70vh,32rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg sm:min-w-[28rem]"
        >
          {groups.map((group) => (
            <div key={group.type} role="group" aria-label={SEARCH_TYPE_LABELS[group.type]} className="py-1">
              <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
                {SEARCH_TYPE_LABELS[group.type]}
              </div>
              {group.items.map((item) => {
                itemIndex += 1;
                const index = itemIndex;
                return (
                  <Link
                    key={item.key}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    href={item.href}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block rounded-md px-2 py-1.5",
                      activeIndex === index && "bg-accent text-accent-foreground"
                    )}
                  >
                    <SearchResultRow item={item} terms={response?.terms ?? []} />
                  </Link>
                );
              })}
            </div>
          ))}

          {!loading && response && !stale && flatItems.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No matches for &ldquo;{trimmed}&rdquo;.
            </p>
          ) : null}

          <Link
            id={`${listboxId}-${seeAllIndex}`}
            role="option"
            aria-selected={activeIndex === seeAllIndex}
            href={resultsPageHref(trimmed)}
            onMouseEnter={() => setActiveIndex(seeAllIndex)}
            onClick={() => setOpen(false)}
            className={cn(
              "mt-1 flex items-center gap-2 rounded-md border-t border-border px-2 py-2 text-sm",
              activeIndex === seeAllIndex && "bg-accent text-accent-foreground"
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="flex-1 truncate">
              See all results for <span className="font-medium">&ldquo;{trimmed}&rdquo;</span>
            </span>
            <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
