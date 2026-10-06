import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";

import { getCurrentTeam, redirectToOwningTeam } from "@/lib/auth/team";
import { getPageStatsForProject } from "@/lib/dashboard/queries";
import { db } from "@/lib/db";
import { pages, projects } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageFormDialog } from "@/components/pages/page-form-dialog";
import { PageRowActions } from "@/components/pages/page-row-actions";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const { team, role } = await getCurrentTeam();
  const canEdit = role !== "viewer";

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.teamId, team.id), eq(projects.slug, projectSlug)))
    .limit(1);

  if (!project) {
    await redirectToOwningTeam({ projectSlug }, `/projects/${projectSlug}`);
    notFound();
  }

  const [projectPages, pageStats] = await Promise.all([
    db.select().from(pages).where(eq(pages.projectId, project.id)).orderBy(asc(pages.name)),
    getPageStatsForProject(project.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            {project.baseUrl ? <Badge variant="secondary">{project.baseUrl}</Badge> : null}
          </div>
          <p className="text-muted-foreground">Pages you&rsquo;re comparing for this project.</p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <ProjectFormDialog
              project={project}
              trigger={<Button variant="outline">Edit project</Button>}
            />
            <DeleteProjectButton
              projectId={project.id}
              projectName={project.name}
              navigateToListOnDelete
              trigger={<Button variant="outline">Delete project</Button>}
            />
            <PageFormDialog
              projectId={project.id}
              trigger={
                <Button>
                  <Plus className="h-4 w-4" />
                  New page
                </Button>
              }
            />
          </div>
        ) : null}
      </div>

      {projectPages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No pages yet</p>
              <p className="text-sm text-muted-foreground">
                Add each view or feature you want to compare, e.g. &ldquo;Checkout&rdquo; or &ldquo;Pricing&rdquo;.
              </p>
            </div>
            {canEdit ? (
              <PageFormDialog
                projectId={project.id}
                trigger={
                  <Button variant="outline">
                    <Plus className="h-4 w-4" />
                    New page
                  </Button>
                }
              />
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectPages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${project.slug}/${page.id}`}
                      className="font-medium hover:underline"
                    >
                      {page.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {page.path}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {page.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-status-open text-status-open">
                        {pageStats.get(page.id)?.openCount ?? 0} open
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-status-resolved text-status-resolved"
                      >
                        {pageStats.get(page.id)?.resolvedCount ?? 0} resolved
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canEdit ? <PageRowActions projectId={project.id} page={page} /> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
