// Regenerate only before applying the first migration; applied SQL is immutable.
import { openDb } from "../server/db.mjs";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "fanmade-schema-")),
  db = openDb(dir);
try {
  const tables = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
    )
    .all();
  const indexes = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY rowid",
    )
    .all();
  const sql = [
    "-- fanMade GoGo! schema v6. Contains no user data or secrets.",
    "BEGIN;",
    "CREATE SCHEMA IF NOT EXISTS fanmade;",
    "SET search_path=fanmade,public;",
  ];
  for (const t of tables) {
    // SQLite puts new columns after table-level CHECK constraints; PG requires columns first.
    let create = t.sql
      .replace(/,\s*CHECK\(reserved\+collected<=total\)/, "")
      .replace("expires INTEGER", "expires BIGINT");
    const end = create.lastIndexOf(")");
    create =
      create.slice(0, end) +
      ", rowid BIGSERIAL" +
      (t.name === "materials" ? ", CHECK(reserved+collected<=total)" : "") +
      create.slice(end);
    sql.push(create + ";", `ALTER TABLE ${t.name} ENABLE ROW LEVEL SECURITY;`);
  }
  sql.push(...indexes.map((i) => i.sql + ";"));
  sql.push(
    "REVOKE ALL ON SCHEMA fanmade FROM PUBLIC;",
    "REVOKE ALL ON SCHEMA fanmade FROM anon, authenticated;",
    "REVOKE ALL ON ALL TABLES IN SCHEMA fanmade FROM PUBLIC, anon, authenticated;",
    "REVOKE ALL ON ALL SEQUENCES IN SCHEMA fanmade FROM PUBLIC, anon, authenticated;",
    "COMMIT;",
    "-- Run through the Supabase SQL editor as project owner, only on a new empty project.",
    "-- Create a PRIVATE Storage bucket named fanmade-images; no anonymous read policies.",
  );
  mkdirSync("supabase/migrations", { recursive: true });
  writeFileSync(
    "supabase/migrations/202610140001_initial.sql",
    sql.join("\n\n") + "\n",
  );
  console.log(
    "Generated empty PostgreSQL schema from SQLite v6, with RLS and no business data.",
  );
} finally {
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
