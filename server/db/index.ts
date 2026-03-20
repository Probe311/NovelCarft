import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DEFAULT_PROJECT_ID = 1;
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "novelcraft.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '{}',
      context TEXT NOT NULL DEFAULT '{}',
      chat_history TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);
}

export interface ProjectRow {
  id: number;
  title: string;
  content: string;
  context: string;
  chat_history: string | null;
  updated_at: number;
}

export interface StoredProjectPayload {
  title: string;
  content: string;
  context: string;
  chatHistory: string | null;
}

export function getProject(): ProjectRow | null {
  const database = getDb();
  const row = database.prepare("SELECT id, title, content, context, chat_history, updated_at FROM projects WHERE id = ?").get(DEFAULT_PROJECT_ID) as ProjectRow | undefined;
  return row ?? null;
}

export function saveProject(project: StoredProjectPayload): void {
  const database = getDb();
  const updatedAt = Date.now();
  database
    .prepare(
      `INSERT INTO projects (id, title, content, context, chat_history, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         context = excluded.context,
         chat_history = excluded.chat_history,
         updated_at = excluded.updated_at`
    )
    .run(
      DEFAULT_PROJECT_ID,
      project.title,
      project.content,
      project.context,
      project.chatHistory ?? null,
      updatedAt
    );
}

export function getSetting(key: string): string | null {
  const database = getDb();
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const database = getDb();
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
