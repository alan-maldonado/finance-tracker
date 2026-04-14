import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  const { card_id, year, month } = req.query;
  const db = getDb();
  let query = 'SELECT * FROM manual_entries WHERE 1=1';
  const params = [];
  if (card_id) { query += ' AND card_id=?'; params.push(card_id); }
  if (year) { query += ' AND year=?'; params.push(year); }
  if (month) { query += ' AND month=?'; params.push(month); }
  query += ' ORDER BY created_at ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { card_id, year, month, amount, description } = req.body;
  if (!card_id || !year || !month || amount === undefined) {
    return res.status(400).json({ error: 'card_id, year, month, amount are required' });
  }
  const db = getDb();
  const card = db.prepare('SELECT id FROM cards WHERE id=?').get(card_id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const result = db.prepare(
    'INSERT INTO manual_entries (card_id, year, month, amount, description) VALUES (?, ?, ?, ?, ?)'
  ).run(card_id, year, month, amount, description || null);
  res.status(201).json(db.prepare('SELECT * FROM manual_entries WHERE id=?').get(result.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM manual_entries WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ ok: true });
});

export default router;
