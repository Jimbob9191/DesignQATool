-- Deleting a project must not strand its assets in a state the CHECK rejects.
--
-- Two referential actions race on a project delete: assets_project_id_projects_id_fk
-- nulls assets.project_id, while the pages cascade nulls assets.page_id through
-- assets_page_id_project_id_pages_fk. Postgres does not order those, and in
-- practice project_id is cleared first — leaving page_id set with no project and
-- tripping assets_page_requires_project, so the delete fails outright.
--
-- Clearing both columns before the delete makes the outcome independent of
-- trigger firing order. src/lib/actions/projects.ts does the same thing, but
-- relying on that would leave the invariant enforced only for callers that
-- remember to; this covers raw SQL and any future code path as well.
--
-- SECURITY DEFINER because the UPDATE must succeed even when the delete arrives
-- from `authenticated` via PostgREST, whose RLS policy on assets would otherwise
-- apply; search_path is pinned for the usual reason.
CREATE OR REPLACE FUNCTION public.unfile_assets_before_project_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE assets SET page_id = NULL, project_id = NULL WHERE project_id = OLD.id;
  RETURN OLD;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_unfile_assets ON projects;--> statement-breakpoint
CREATE TRIGGER projects_unfile_assets
BEFORE DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION public.unfile_assets_before_project_delete();
