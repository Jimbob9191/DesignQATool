import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { FileText, GitCompare, ImageOff, Plus } from "lucide-react";

import { getAssetSignedUrls } from "@/lib/assets/signed-url";
import { getCurrentTeam } from "@/lib/auth/team";
import { getPageStatsForProject, getProjectComparisons } from "@/lib/dashboard/queries";
import { db } from "@/lib/db";
import { assets, pages, projects } from "@/lib/db/schema";
import { buildProjectCrumbs } from "@/lib/navigation/crumbs";
import { PageBreadcrumb } from "@/components/app-shell/page-breadcrumb";
import { AssetCard } from "@/components/assets/asset-card";
import { UploadDropzone } from "@/components/assets/upload-dropzone";
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
    notFound();
  }

  const projectPages = await db
    .select()
    .from(pages)
    .where(eq(pages.projectId, project.id))
    .orderBy(asc(pages.name));

  const pageStats = await getPageStatsForProject(project.id);

  const projectComparisons = await getProjectComparisons(project.id);

  // Everything filed under this project, not just the page-less library:
  // the point of this page is to answer "what is in here", and an asset that
  // vanished from the grid the moment it was assigned to a page would answer
  // it badly. Captures are always page-bound, so they show up here too.
  const projectAssets = await db
    .select()
    .from(assets)
    .where(and(eq(assets.teamId, team.id), eq(assets.projectId, project.id)))
    .orderBy(desc(assets.createdAt));

  const comparisonThumbnailUrls = await getAssetSignedUrls(
    projectComparisons.map((c) => c.designStoragePath),
    { thumbnail: true },
  );
  const assetSignedUrls = await getAssetSignedUrls(projectAssets.map((a) => a.storagePath));

  const pageOptions = projectPages.map((page) => ({ id: page.id, label: page.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb
        items={buildProjectCrumbs({ projectName: project.name, projectSlug: project.slug })}
      />

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

      <div>
        <h2 className="mb-3 text-lg font-medium">Comparisons</h2>
        {projectComparisons.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <GitCompare className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No comparisons yet. Open a page to capture the live site and compare it to a
                design.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {projectComparisons.map((comparison) => (
              <Link
                key={comparison.id}
                href={`/projects/${project.slug}/${comparison.pageId}/compare/${comparison.id}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {comparisonThumbnailUrls.get(comparison.designStoragePath) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URLs
                    <img
                      src={comparisonThumbnailUrls.get(comparison.designStoragePath)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <GitCompare className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-1 items-center justify-between">
                  {/* These come from every page of the project, so each row has
                      to name the page it belongs to. */}
                  <div className="flex flex-col">
                    <span className="font-medium">{comparison.name}</span>
                    <span className="text-xs text-muted-foreground">{comparison.pageName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {comparison.createdAt.toLocaleString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Assets</h2>
        {/* Dropping here files an asset against the project but no page — the
            shared-export staging area comparisons can also draw designs from. */}
        {canEdit ? (
          <div className="mb-4">
            <UploadDropzone defaultProjectId={project.id} />
          </div>
        ) : null}
        {projectAssets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ImageOff className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No assets in this project yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {projectAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={{
                  id: asset.id,
                  kind: asset.kind,
                  storagePath: asset.storagePath,
                  width: asset.width,
                  height: asset.height,
                  pageId: asset.pageId,
                  projectId: asset.projectId,
                  signedUrl: assetSignedUrls.get(asset.storagePath) ?? null,
                }}
                pageOptions={pageOptions}
                projectOptions={[{ id: project.id, label: project.name }]}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
