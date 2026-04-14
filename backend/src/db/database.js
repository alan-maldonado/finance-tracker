import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../data/finance.db');

let db;

export function getDb() {
  if (!db) {
    mkdirSync(join(__dirname, '../../data'), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);

    // Ensure at least one default profile exists
    const profileCount = db.prepare('SELECT COUNT(*) as n FROM profiles').get().n;
    if (profileCount === 0) {
      db.prepare("INSERT INTO profiles (id, name) VALUES (?, 'Personal')").run(randomUUID());
    }
  }
  return db;
}
