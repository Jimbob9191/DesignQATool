import "server-only";

import { ASSETS_BUCKET, createAdminClient } from "@/lib/supabase/admin";

const STORAGE_PAGE_SIZE = 1000;

// Every object path under `prefix` in the assets bucket. Uploads live at
// `<teamId>/<assetId>.<ext>` today, but this walks any subfolders too (list()
// reports a folder as an entry with a null id), so nothing nested is missed.
async function listStoragePaths(
  bucket: ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>,
  prefix: string
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, { limit: STORAGE_PAGE_SIZE, offset });
    if (error) throw new Error(error.message);
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listStoragePaths(bucket, path)));
      } else {
        paths.push(path);
      }
    }
    if (data.length < STORAGE_PAGE_SIZE) return paths;
  }
}

// Removes everything under `<teamId>/` in the assets bucket. Deleting the
// team row cascades through every table, but Storage objects aren't rows, so
// they'd be orphaned without this. Throws if Storage fails, so the caller can
// stop before deleting the team rows and leave something to retry.
//
// Lives outside the "use server" action files on purpose: exported from one of
// those, it would become an action any client could call with any team id.
export async function removeTeamStorage(teamId: string): Promise<void> {
  const bucket = createAdminClient().storage.from(ASSETS_BUCKET);
  const paths = await listStoragePaths(bucket, teamId);
  for (let i = 0; i < paths.length; i += STORAGE_PAGE_SIZE) {
    const { error } = await bucket.remove(paths.slice(i, i + STORAGE_PAGE_SIZE));
    if (error) throw new Error(error.message);
  }
}
