import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { AlertCircle, Clock, GitCompare } from "lucide-react";

import { getAppOrigin } from "@/lib/app-origin";
import { assetDisplayName } from "@/lib/assets/name";
import { getAssetSignedUrls } from "@/lib/assets/signed-url";
import { getAssetComparisonNames } from "@/lib/assets/usage";
import { getCurrentTeam, redirectToOwningTeam } from "@/lib/auth/team";
import { db } from "@/lib/db";
import { assets, captures, comparisons, pages, projects } from "@/lib/db/schema";
import { bridgeSnippet } from "@/lib/live/protocol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssetCard } from "@/components/assets/asset-card";
import { UploadDropzone } from "@/components/assets/upload-dropzone";
import { BridgeSnippet } from "@/components/comparisons/bridge-snippet";
import { CreateComparisonDialog } from "@/components/comparisons/create-comparison-dialog";

export default async function PageDetailPage({
  params,
}: {
  params: Promise<{ projectSlug: string; pageId: string }>;
}) {
  const { projectSlug, pageId } = await params;
  const { team, role } = await getCurrentTeam();
  const canEdit = role !== "viewer";

  const [row] = await db
    .select({ page: pages, project: projects })
    .from(pages)
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(projects.teamId, team.id), eq(projects.slug, projectSlug), eq(pages.id, pageId)))
    .limit(1);

  if (!row) {
    await redirectToOwningTeam({ projectSlug, pageId }, `/projects/${projectSlug}/${pageId}`);
    notFound();
  }

  const [pageCaptures, designAssets, otherDesigns, pageComparisons] = await Promise.all([
    db
      .select({ capture: captures, asset: assets })
      .from(captures)
      .innerJoin(assets, eq(captures.assetId, assets.id))
      .where(eq(assets.pageId, pageId))
      .orderBy(desc(captures.createdAt)),
    db
      .select()
      .from(assets)
      .where(and(eq(assets.pageId, pageId), eq(assets.kind, "design")))
      .orderBy(desc(assets.createdAt)),
    // The rest of the team's designs can be compared here too.
    db
      .select({
        id: assets.id,
        name: assets.name,
        storagePath: assets.storagePath,
        width: assets.width,
        pageName: pages.name,
      })
      .from(assets)
      .leftJoin(pages, eq(assets.pageId, pages.id))
      .where(and(eq(assets.teamId, team.id), eq(assets.kind, "design"), or(isNull(assets.pageId), ne(assets.pageId, pageId))))
      .orderBy(desc(assets.createdAt)),
    db
      .select({ comparison: comparisons, designAsset: assets })
      .from(comparisons)
      .innerJoin(assets, eq(comparisons.designAssetId, assets.id))
      .where(eq(comparisons.pageId, pageId))
      .orderBy(desc(comparisons.createdAt)),
  ]);

  const [signedUrls, thumbnailUrls, comparisonNames] = await Promise.all([
    getAssetSignedUrls([
      ...pageCaptures.filter((c) => c.capture.status === "ready").map((c) => c.asset.storagePath),
      ...designAssets.map((a) => a.storagePath),
    ]),
    // Also feeds the design picker's thumbnails, so it covers every option.
    getAssetSignedUrls(
      [
        ...new Set([
          ...pageComparisons.map(({ designAsset }) => designAsset.storagePath),
          ...designAssets.map((a) => a.storagePath),
          ...otherDesigns.map((a) => a.storagePath),
        ]),
      ],
      { thumbnail: true },
    ),
    getAssetComparisonNames(designAssets.map((a) => a.id)),
  ]);

  const defaultUrl = row.project.baseUrl
    ? new URL(row.page.path, row.project.baseUrl).toString()
    : "";

  const designOptions = [
    ...designAssets.map((a) => ({
      id: a.id,
      label: assetDisplayName(a),
      thumbnailUrl: thumbnailUrls.get(a.storagePath) ?? null,
      width: a.width,
      note: null,
    })),
    ...otherDesigns.map((a) => ({
      id: a.id,
      label: assetDisplayName(a),
      thumbnailUrl: thumbnailUrls.get(a.storagePath) ?? null,
      width: a.width,
      note: a.pageName ? `from ${a.pageName}` : "not on a page yet",
    })),
  ];

  const snippet = bridgeSnippet(await getAppOrigin());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{row.page.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">{row.page.path}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sites that need the snippet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Comparisons load the live site through a preview proxy, with nothing to install. If a
            site doesn&rsquo;t work that way (it needs a sign-in, or blocks proxies), switch the
            comparison to Direct and add this snippet to the site — staging or localhost is fine.
            It does nothing unless the page is opened inside DesignParity.app.
          </p>
          <BridgeSnippet snippet={snippet} />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-medium">Designs</h2>
        <div className="flex flex-col gap-4">
          {canEdit ? <UploadDropzone defaultPageId={pageId} /> : null}
          {designAssets.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {designAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={{
                    id: asset.id,
                    kind: asset.kind,
                    name: assetDisplayName(asset),
                    width: asset.width,
                    height: asset.height,
                    pageId: asset.pageId,
                    signedUrl: signedUrls.get(asset.storagePath) ?? null,
                    comparisonNames: comparisonNames.get(asset.id) ?? [],
                  }}
                  pageOptions={[{ id: pageId, label: row.page.name }]}
                  canEdit={canEdit}
                />
              ))}
            </div>
          ) : !canEdit ? (
            <p className="text-sm text-muted-foreground">No designs on this page yet.</p>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Comparisons</h2>
          {canEdit ? (
            <CreateComparisonDialog
              projectSlug={projectSlug}
              pageId={pageId}
              designOptions={designOptions}
              defaultUrl={defaultUrl}
              trigger={
                <Button variant="outline" size="sm">
                  <GitCompare className="h-4 w-4" />
                  New comparison
                </Button>
              }
            />
          ) : null}
        </div>
        {pageComparisons.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <GitCompare className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {designOptions.length === 0
                  ? "Upload a design above, then compare it with the live site."
                  : "No comparisons yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {pageComparisons.map(({ comparison, designAsset }) => (
              <Link
                key={comparison.id}
                href={`/projects/${projectSlug}/${pageId}/compare/${comparison.id}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {thumbnailUrls.get(designAsset.storagePath) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URLs
                    <img
                      src={thumbnailUrls.get(designAsset.storagePath)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <GitCompare className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-1 items-center justify-between">
                  <span className="font-medium">{comparison.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {comparison.createdAt.toLocaleString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {pageCaptures.length > 0 ? (
        <div>
          <h2 className="mb-1 text-lg font-medium">Earlier captures</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Screenshots from before comparisons showed the live site. Comparisons made from them
            still open.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {pageCaptures.map(({ capture, asset }) => (
              <Card key={capture.id} className="overflow-hidden py-0">
                <div className="flex aspect-square items-center justify-center bg-muted">
                  {capture.status === "ready" && signedUrls.get(asset.storagePath) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, signed, short-lived URLs
                    <img
                      src={signedUrls.get(asset.storagePath)}
                      alt={capture.url}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : capture.status === "pending" ? (
                    <Clock className="h-6 w-6 animate-pulse text-muted-foreground" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-destructive" />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={
                        capture.status === "ready"
                          ? "secondary"
                          : capture.status === "error"
                            ? "destructive"
                            : "outline"
                      }
                      className="capitalize"
                    >
                      {capture.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{capture.viewportWidth}px</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground" title={capture.url}>
                    {capture.url}
                  </p>
                  {capture.status === "error" && capture.errorMessage ? (
                    <p className="truncate text-xs text-destructive" title={capture.errorMessage}>
                      {capture.errorMessage}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {(capture.capturedAt ?? capture.createdAt).toLocaleString()}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

    </div>
  );
}
