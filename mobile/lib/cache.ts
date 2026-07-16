import * as SQLite from "expo-sqlite"

let database: Promise<SQLite.SQLiteDatabase> | null = null

async function getDatabase() {
  if (!database) {
    database = SQLite.openDatabaseAsync("reason.db").then(async (db) => {
      await db.execAsync(
        "CREATE TABLE IF NOT EXISTS cache_entries (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
      )
      return db
    })
  }
  return database
}

export async function readCache<T>(key: string): Promise<T | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM cache_entries WHERE key = ?",
    key
  )
  return row ? (JSON.parse(row.value) as T) : null
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    "INSERT OR REPLACE INTO cache_entries (key, value, updated_at) VALUES (?, ?, ?)",
    key,
    JSON.stringify(value),
    new Date().toISOString()
  )
}

export async function clearCache(): Promise<void> {
  const db = await getDatabase()
  await db.runAsync("DELETE FROM cache_entries")
}
