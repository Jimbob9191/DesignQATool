import { and, desc, eq, isNull } from "drizzle-orm";

import { getCurrentTeam } from "@/lib/auth/team";
import { getAssetSignedUrls } from "@/lib/assets/signed-url";
import { db } from "@/lib/db";
import { assets, pages, projects } from "@/lib/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { AssetCard } from "@/components/assets/asset-card";
import { AssetFilters } from "@/components/assets/asset-filters";
import { UploadDropzone } from "@/components/assets/upload-dropzone";
import { ImageOff } from "lucide-react";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; kind?: string; project?: string }>;
}) {
  const { page: pageFilter, kind: kindFilter, project: projectFilter } = await searchParams;
  const { team, role } = await getCurrentTeam();
  const canEdit = role !== "viewer";

  // Left join, not inner: a project with no pages yet still has to appear in
  // the project options, otherwise an asset filed against it would render a
  // blank project select.
  const teamPageRows = await db
    .select({
      pageId: pages.id,
      pageName: pages.name,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(projects)
    .leftJoin(pages, eq(pages.projectId, projects.id))
    .where(eq(projects.teamId, team.id))
    .orderBy(projects.name, pages.name);

  const pageOptions = teamPageRows
    .filter((row) => row.pageId !== null && row.pageName !== null)
    .map((row) => ({ id: row.pageId!, label: `${row.projectName} / ${row.pageName}` }));

  const projectOptions = [
    ...new Map(teamPageRows.map((row) => [row.projectId, row.projectName])).entries(),
  ].map(([id, label]) => ({ id, label }));

  const conditions = [eq(assets.teamId, team.id)];
  if (pageFilter === "unassigned") {
    conditions.push(isNull(assets.pageId));
  } else if (pageFilter) {
    conditions.push(eq(assets.pageId, pageFilter));
  }
  if (projectFilter === "unassigned") {
    conditions.push(isNull(assets.projectId));
  } else if (projectFilter) {
    conditions.push(eq(assets.projectId, projectFilter));
  }
  if (kindFilter === "design" || kindFilter === "capture") {
    conditions.push(eq(assets.kind, kindFilter));
  }

  const teamAssets = await db
    .select()
    .from(assets)
    .where(and(...conditions))
    .orderBy(desc(assets.createdAt));

  const signedUrls = await getAssetSignedUrls(teamAssets.map((a) => a.storagePath));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <p className="text-muted-foreground">Design uploads and captures for your team.</p>
      </div>

      {canEdit ? <UploadDropzone /> : null}

      <AssetFilters pageOptions={pageOptions} projectOptions={projectOptions} />

      {teamAssets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No assets yet</p>
              <p className="text-sm text-muted-foreground">
                Drag design exports in above to add them to your library.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {teamAssets.map((asset) => (
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
                signedUrl: signedUrls.get(asset.storagePath) ?? null,
              }}
              pageOptions={pageOptions}
              projectOptions={projectOptions}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
