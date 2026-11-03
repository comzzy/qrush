import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export const migrationsDir = () =>
  process.env.QRUSH_MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

function prepare(sqlite: Database.Database): Db {
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir() });
  return db;
}

export function openDb(path: string): { db: Db; close: () => void } {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  const db = prepare(sqlite);
  return { db, close: () => sqlite.close() };
}

/** In-memory database, optionally restored from a serialized snapshot. */
export type MemoryDb = {
  db: Db;
  changes: () => number;
  serialize: () => Buffer;
  close: () => void;
};

export function openMemoryDb(snapshot?: Buffer | null): MemoryDb {
  const sqlite = snapshot && snapshot.length ? new Database(snapshot) : new Database(":memory:");
  const db = prepare(sqlite);
  const totalChanges = sqlite.prepare("select total_changes()").pluck();
  return {
    db,
    changes: () => Number(totalChanges.get()),
    serialize: () => sqlite.serialize(),
    close: () => sqlite.close(),
  };
}
