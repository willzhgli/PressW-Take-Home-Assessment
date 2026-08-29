import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env";

/**
 * SQLite via Node's built-in `node:sqlite` driver — no native build step, works
 * on node:24-alpine as-is. One synchronous connection, opened once at import.
 * The schema is created idempotently, so this doubles as the migration.
 */

// Make sure the containing directory exists before opening the file.
mkdirSync(path.dirname(env.dbPath), { recursive: true });

export const db = new DatabaseSync(env.dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS profile_facts (
    user_id    TEXT    NOT NULL,
    category   TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, category, value)
  )
`);

db.exec(
  "CREATE INDEX IF NOT EXISTS idx_profile_facts_user ON profile_facts (user_id)",
);
