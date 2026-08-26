import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FolderKanban, Plus } from "lucide-react";

import { getCurrentTeam } from "@/lib/auth/team";
import { getProjectStats } from "@/lib/dashboard/queries";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
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
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectRowActions } from "@/components/projects/project-row-actions";

export default async function ProjectsPage() {
  const { team, role } = await getCurrentTeam();
  const canEdit = role !== "viewer";

  // The stats query returns its own project rows, but this table also needs
  // baseUrl/createdAt and a full project object for ProjectRowActions, so both
  // are loaded and joined by id here.
  const [teamProjects, projectStats] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(eq(projects.teamId, team.id))
      .orderBy(desc(projects.createdAt)),
    getProjectStats(team.id),
  ]);

  const statsByProject = new Map(projectStats.map((stats) => [stats.id, stats]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Websites you&rsquo;re running design QA against.</p>
        </div>
        {canEdit ? (
          <ProjectFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                New project
              </Button>
            }
          />
        ) : null}
      </div>

      {teamProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                Create a project for each website you want to review.
              </p>
            </div>
            {canEdit ? (
              <ProjectFormDialog
                trigger={
                  <Button variant="outline">
                    <Plus className="h-4 w-4" />
                    New project
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
                <TableHead>Base URL</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Comparisons</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamProjects.map((project) => {
                const stats = statsByProject.get(project.id);
                return (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${project.slug}`}
                      className="font-medium hover:underline"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.baseUrl ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {stats?.pageCount ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {stats?.comparisonCount ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-status-open text-status-open">
                      {(stats?.openCount ?? 0) + (stats?.needsReviewCount ?? 0)} open
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {canEdit ? <ProjectRowActions project={project} /> : null}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
