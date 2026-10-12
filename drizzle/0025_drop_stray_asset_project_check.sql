-- The production database picked up three migrations from the unmerged
-- feat/forgot-password branch (Aug 2026), which scoped assets to projects:
-- an assets.project_id column, CHECK (page_id IS NULL OR project_id IS NOT
-- NULL), and a composite (page_id, project_id) foreign key that replaced the
-- plain page_id one. Nothing on main sets project_id, so that CHECK made every
-- write that puts an asset on a page fail: uploading on a page, moving an
-- asset to a page, and creating a comparison from an unfiled design.
--
-- Put assets back to main's schema for page_id. project_id, its own foreign
-- key and the projects_unfile_assets trigger are left in place: they hold the
-- branch's data and no longer constrain anything main does. Every statement is
-- conditional, so on a database that never had the branch this is a no-op.
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_page_requires_project";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_page_id_project_id_pages_fk";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assets'::regclass AND conname = 'assets_page_id_pages_id_fk'
  ) THEN
    -- Clear any page_id left pointing at a deleted page while the composite
    -- key (which ignores rows with a null project_id) was in charge.
    UPDATE "assets" SET "page_id" = NULL
    WHERE "page_id" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "pages" WHERE "pages"."id" = "assets"."page_id");
    ALTER TABLE "assets" ADD CONSTRAINT "assets_page_id_pages_id_fk"
      FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
