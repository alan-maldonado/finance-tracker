import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
    // Migrations
    try { db.prepare('ALTER TABLE statements ADD COLUMN no_interest_payment REAL').run(); } catch {}
    try {
      db.prepare('ALTER TABLE cards ADD COLUMN sort_order INTEGER DEFAULT 0').run();
      // Initialize sort_order from rowid so existing cards keep their order
      db.prepare('UPDATE cards SET sort_order = id WHERE sort_order = 0').run();
    } catch {}
    // Rename citibanamex → banamex in existing data
    db.prepare("UPDATE cards SET bank='banamex' WHERE bank='citibanamex'").run();
    db.prepare("UPDATE statements SET raw_json=REPLACE(raw_json,'\"bank\":\"citibanamex\"','\"bank\":\"banamex\"') WHERE raw_json LIKE '%citibanamex%'").run();
  }
  return db;
}
