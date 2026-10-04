import Form from "next/form";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";

import { getCurrentTeam } from "@/lib/auth/team";
import { SEARCH_TYPE_LABELS, toSearchItems } from "@/lib/search/items";
import { searchTeam } from "@/lib/search/queries";
import { isSearchType, MAX_QUERY_LENGTH, SEARCH_TYPES, type SearchType } from "@/lib/search/text";
import { SEARCH_TYPE_ICONS, SearchResultRow } from "@/components/search/search-result-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 8;
const FILTERED_LIMIT = 50;

function searchHref(query: string, type?: SearchType) {
  const params = new URLSearchParams({ q: query });
  if (type) params.set("type", type);
  return `/search?${params}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; type?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = (typeof params.q === "string" ? params.q : "").trim();
  const type = isSearchType(params.type) ? params.type : undefined;
  const { team } = await getCurrentTeam();

  const limit = type ? FILTERED_LIMIT : PREVIEW_LIMIT;
  const results = await searchTeam(team.id, query, { limit, only: type });
  const items = toSearchItems(results);
  const groups = SEARCH_TYPES.map((groupType) => ({ type: groupType, items: items[groupType] })).filter(
    (group) => group.items.length > 0
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
          <p className="text-muted-foreground">
            Find projects, pages, comparisons and comments across {team.name}.
          </p>
        </div>

        <Form action="/search" className="flex max-w-2xl gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              key={query}
              name="q"
              type="search"
              defaultValue={query}
              maxLength={MAX_QUERY_LENGTH}
              placeholder="Search by name, URL path or comment text…"
              autoFocus={!query}
              className="h-9 pl-8"
            />
          </div>
          {type ? <input type="hidden" name="type" value={type} /> : null}
          <Button type="submit" className="h-9">
            Search
          </Button>
        </Form>

        {query ? (
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter results">
            {[undefined, ...SEARCH_TYPES].map((tab) => (
              <Link
                key={tab ?? "all"}
                href={searchHref(query, tab)}
                aria-current={tab === type ? "page" : undefined}
                className={cn(
                  "rounded-full border border-border px-3 py-1 text-sm transition-colors hover:bg-muted",
                  tab === type && "border-foreground bg-foreground text-background hover:bg-foreground/90"
                )}
              >
                {tab ? SEARCH_TYPE_LABELS[tab] : "All"}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {!query ? (
        <Card>
          <CardContent className="flex flex-col gap-2 py-8 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">What can I search?</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Project names and site URLs</li>
              <li>Page names, URL paths (e.g. &ldquo;/pricing&rdquo;) and descriptions</li>
              <li>Comparison names</li>
              <li>Comment text, including replies</li>
            </ul>
            <p>
              Every word has to match, but not necessarily in the same place &mdash; &ldquo;acme
              pricing&rdquo; finds the Pricing page in the Acme project. Press{" "}
              <kbd className="rounded border border-border bg-muted px-1 text-xs">⌘K</kbd> anywhere to search.
            </p>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No {type ? SEARCH_TYPE_LABELS[type].toLowerCase() : "results"} match &ldquo;{query}&rdquo;.
            </p>
            {type ? (
              <Link href={searchHref(query)} className="text-sm underline underline-offset-4">
                Search everything instead
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">Try fewer or shorter words.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => {
            const Icon = SEARCH_TYPE_ICONS[group.type];
            const hasMore = group.items.length === limit;
            return (
              <Card key={group.type}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {SEARCH_TYPE_LABELS[group.type]}
                    <span className="text-sm font-normal text-muted-foreground">
                      {group.items.length}
                      {hasMore ? "+" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <Link key={item.key} href={item.href} className="rounded-md px-2 py-2 hover:bg-muted">
                      <SearchResultRow item={item} terms={results.terms} />
                    </Link>
                  ))}
                  {hasMore && !type ? (
                    <Link
                      href={searchHref(query, group.type)}
                      className="px-2 pt-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Show all {SEARCH_TYPE_LABELS[group.type].toLowerCase()}
                    </Link>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
