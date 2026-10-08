import Link from "next/link";
import { AlertCircle, FolderKanban, GitCompare, MessageSquare, Sparkles } from "lucide-react";

import { getCurrentTeam } from "@/lib/auth/team";
import { getActivityFeed, getNeedsAttention, getProjectStats } from "@/lib/dashboard/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function timeAgo(date: Date): string {
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const { team } = await getCurrentTeam();

  const [projectStats, needsAttention, activity] = await Promise.all([
    getProjectStats(team.id),
    getNeedsAttention(team.id, 8),
    getActivityFeed(team.id, 12),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          An overview of {team.name}&rsquo;s projects and open review items.
        </p>
      </div>

      {projectStats.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Link href="/projects" className="text-primary hover:underline">
              Create a project
            </Link>{" "}
            to start comparing designs against the live site.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectStats.map((p) => (
            <Link key={p.id} href={`/projects/${p.slug}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    {p.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <Badge variant="outline" className="border-status-open text-status-open">
                    {p.openCount} open
                  </Badge>
                  {p.needsReviewCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-status-needs-review text-status-needs-review"
                    >
                      {p.needsReviewCount} needs review
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="border-status-resolved text-status-resolved">
                    {p.resolvedCount} resolved
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {needsAttention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
            ) : (
              needsAttention.map((item) => (
                <Link
                  key={item.annotationId}
                  href={`/projects/${item.projectSlug}/${item.pageId}/compare/${item.comparisonId}?pin=${item.annotationId}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="truncate">
                    {item.projectName} / {item.pageName} — {item.comparisonName}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      item.status === "needs_review"
                        ? "shrink-0 border-status-needs-review text-status-needs-review"
                        : "shrink-0 border-status-open text-status-open"
                    }
                  >
                    {item.status === "needs_review" ? "Needs review" : "Open"}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              activity.map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={
                    item.type === "comparison"
                      ? `/projects/${item.projectSlug}/${item.pageId}/compare/${item.id}`
                      : `/projects/${item.projectSlug}/${item.pageId}/compare/${item.comparisonId}?pin=${item.type === "comment" ? item.annotationId : item.id}`
                  }
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  {item.type === "comment" ? (
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : item.type === "comparison" ? (
                    <GitCompare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{item.authorEmail}</span>{" "}
                    {item.type === "comment"
                      ? "commented on"
                      : item.type === "comparison"
                        ? "created comparison"
                        : "pinned"}{" "}
                    {item.pageName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(item.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
