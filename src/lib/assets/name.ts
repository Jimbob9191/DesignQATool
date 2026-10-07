// The name to show for an asset. Rows from before uploads kept their
// filename (and captures, which never had one) fall back to the storage
// path's basename, e.g. "3f2a….png".
export function assetDisplayName(asset: { name: string | null; storagePath: string }): string {
  return asset.name ?? asset.storagePath.split("/").pop() ?? asset.storagePath;
}
