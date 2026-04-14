import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  const { statement_id, card_id, year, month } = req.query;
  const db = getDb();

  if (statement_id) {
    const txs = db.prepare(
      'SELECT * FROM transactions WHERE statement_id=? ORDER BY date ASC'
    ).all(statement_id);
    return res.json(txs);
  }

  if (card_id && year && month) {
    const stmt = db.prepare(
      'SELECT id FROM statements WHERE card_id=? AND period_year=? AND period_month=?'
    ).get(card_id, year, month);
    if (!stmt) return res.json([]);
    const txs = db.prepare(
      'SELECT * FROM transactions WHERE statement_id=? ORDER BY date ASC'
    ).all(stmt.id);
    return res.json(txs);
  }

  res.status(400).json({ error: 'Provide statement_id or (card_id + year + month)' });
});

export default router;
