import { Router } from 'express';
import multer from 'multer';
import { readFileSync, mkdirSync, renameSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from '../db/database.js';
import { parsePDF } from '../services/pdf-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = join(__dirname, '../../uploads');

// Temp storage for parse-only and initial upload (renamed after we know the period)
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = join(UPLOADS_ROOT, 'tmp');
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`),
});
const upload = multer({ storage: tempStorage, limits: { fileSize: 20 * 1024 * 1024 } });

function safeFilename(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').toLowerCase();
}

const router = Router();

// Parse only — returns extracted data without saving
router.post('/parse', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { password } = req.body;
    const result = await parsePDF(readFileSync(req.file.path), { password });
    res.json(result);
  } catch (err) {
    const msg = err.message || String(err);
    if (/no password/i.test(msg)) return res.status(422).json({ error: 'No password given' });
    if (/incorrect password/i.test(msg)) return res.status(422).json({ error: 'Incorrect password' });
    next(err);
  }
});

// Upload, parse, and save
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const { card_id } = req.body;
    if (!card_id) return res.status(400).json({ error: 'card_id is required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const db = getDb();
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(card_id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const buffer = readFileSync(req.file.path);
    const { password } = req.body;
    const parsed = await parsePDF(buffer, { password });

    if (!parsed.period) {
      return res.status(422).json({
        error: 'Could not extract statement period from PDF',
        bank: parsed.bank,
        sample: parsed.raw_text?.slice(0, 300),
      });
    }

    const { period, summary, transactions } = parsed;

    // Move file to structured folder: uploads/statements/{card_id}/{alias}-{YYYY}-{MM}.pdf
    const destDir = join(UPLOADS_ROOT, 'statements', String(card_id));
    mkdirSync(destDir, { recursive: true });
    const pdfName = `${safeFilename(card.alias)}-${period.year}-${String(period.month).padStart(2, '0')}.pdf`;
    const destPath = join(destDir, pdfName);
    renameSync(req.file.path, destPath);
    // Relative path stored in DB (served under /uploads/)
    const pdfRelPath = `statements/${card_id}/${pdfName}`;

    // Upsert statement
    const existing = db.prepare(
      'SELECT id FROM statements WHERE card_id=? AND period_year=? AND period_month=?'
    ).get(card_id, period.year, period.month);

    let statementId;

    if (existing) {
      db.prepare(`
        UPDATE statements SET
          cutoff_date=?, payment_due_date=?, minimum_payment=?, total_balance=?,
          no_interest_payment=?, pdf_filename=?, raw_json=?
        WHERE id=?
      `).run(
        period.cutoffDate, period.dueDate,
        summary?.minimumPayment, summary?.totalBalance,
        summary?.noInterestPayment ?? null,
        pdfRelPath, JSON.stringify(parsed),
        existing.id
      );
      db.prepare('DELETE FROM transactions WHERE statement_id=?').run(existing.id);
      statementId = existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO statements
          (card_id, period_year, period_month, cutoff_date, payment_due_date,
           minimum_payment, total_balance, no_interest_payment, pdf_filename, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        card_id, period.year, period.month,
        period.cutoffDate, period.dueDate,
        summary?.minimumPayment, summary?.totalBalance,
        summary?.noInterestPayment ?? null,
        pdfRelPath, JSON.stringify(parsed)
      );
      statementId = result.lastInsertRowid;
    }

    // Insert transactions
    const insertTx = db.prepare(`
      INSERT INTO transactions
        (statement_id, date, description, amount, type,
         msi_total_months, msi_current_month, msi_monthly_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(txs => {
      for (const tx of txs) {
        insertTx.run(
          statementId, tx.date, tx.description, tx.amount, tx.type,
          tx.msiTotalMonths ?? null, tx.msiCurrentMonth ?? null, tx.msiMonthlyAmount ?? null
        );
      }
    })(transactions);

    // Clear manual entries superseded by this statement
    db.prepare(
      'DELETE FROM manual_entries WHERE card_id=? AND year=? AND month=?'
    ).run(card_id, period.year, period.month);

    const statement = db.prepare('SELECT * FROM statements WHERE id=?').get(statementId);
    res.status(201).json({ statement, transactionCount: transactions.length, bank: parsed.bank });
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res) => {
  const db = getDb();
  const { card_id, year, month } = req.query;
  let query = 'SELECT * FROM statements WHERE 1=1';
  const params = [];
  if (card_id) { query += ' AND card_id=?'; params.push(card_id); }
  if (year)    { query += ' AND period_year=?'; params.push(year); }
  if (month)   { query += ' AND period_month=?'; params.push(month); }
  query += ' ORDER BY period_year DESC, period_month DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const statement = db.prepare('SELECT * FROM statements WHERE id=?').get(req.params.id);
  if (!statement) return res.status(404).json({ error: 'Statement not found' });
  res.json(statement);
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM statements WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Statement not found' });
  res.json({ ok: true });
});

export default router;
