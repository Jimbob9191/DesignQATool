import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit only auto-loads `.env` by default; our secrets live in
// `.env.local` (the Next.js convention), so load it explicitly.
config({ path: ".env.local" });

// `generate` diffs the schema files locally and needs no live connection;
// only `push` / `migrate` / `studio` need a real DATABASE_URL.
export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
  // auth.* and realtime.* tables are managed by Supabase, not us.
  schemaFilter: ["public"],
  casing: "snake_case",
  strict: true,
  verbose: true,
});
