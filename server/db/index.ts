import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DATA_DIR, DB_PATH, MIGRATIONS_DIR } from '../paths'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(database: Database.Database): void {
  database.exec(
    'CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  )
  const applied = new Set(
    database.prepare('SELECT name FROM migrations').all().map((r) => (r as { name: string }).name),
  )
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const record = database.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    database.transaction(() => {
      database.exec(sql)
      record.run(file, new Date().toISOString())
    })()
  }
}

export const now = () => new Date().toISOString()
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
