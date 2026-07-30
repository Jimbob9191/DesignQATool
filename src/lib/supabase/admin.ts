import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

// service_role client: bypasses RLS, used server-side only for Storage
// operations (signed upload/download URLs). Every call site must do its own
// requireTeamRole()/team-scoping check first — same pattern as our Drizzle
// client, which also connects with elevated privileges.
export function createAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const ASSETS_BUCKET = "assets";
