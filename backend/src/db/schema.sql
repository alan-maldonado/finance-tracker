CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  bank TEXT NOT NULL,
  alias TEXT NOT NULL,
  last4 TEXT,
  credit_limit REAL,
  color TEXT DEFAULT '#6366f1',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  cutoff_date TEXT,
  payment_due_date TEXT,
  minimum_payment REAL,
  no_interest_payment REAL,
  total_balance REAL,
  pdf_filename TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(card_id, period_year, period_month)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id INTEGER NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  msi_total_months INTEGER,
  msi_current_month INTEGER,
  msi_monthly_amount REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS manual_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
