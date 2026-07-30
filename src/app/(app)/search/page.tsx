import Link from "next/link";
import { FileText, MessageSquare, SearchX } from "lucide-react";

import { getCurrentTeam } from "@/lib/auth/team";
import { searchComments, searchPages } from "@/lib/search/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const { team } = await getCurrentTeam();

  const [pageResults, commentResults] = query
    ? await Promise.all([searchPages(team.id, query), searchComments(team.id, query)])
    : [[], []];

  const hasResults = pageResults.length > 0 || commentResults.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground">
          {query ? (
            <>
              Results for <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>
            </>
          ) : (
            "Search pages and comments across your team."
          )}
        </p>
      </div>

      {!query ? null : !hasResults ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {pageResults.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Pages
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {pageResults.map((result) => (
                  <Link
                    key={result.pageId}
                    href={`/projects/${result.projectSlug}/${result.pageId}`}
                    className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="text-sm font-medium">
                      {result.projectName} / {result.pageName}
                    </span>
                    {result.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {result.description}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {commentResults.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Comments
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {commentResults.map((result) => (
                  <Link
                    key={result.commentId}
                    href={`/projects/${result.projectSlug}/${result.pageId}/compare/${result.comparisonId}`}
                    className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="text-sm font-medium">
                      {result.projectName} / {result.pageName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{result.body}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
