import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { profile_id } = req.query;
  if (profile_id) {
    return res.json(db.prepare('SELECT * FROM cards WHERE profile_id=? ORDER BY sort_order ASC, id ASC').all(profile_id));
  }
  res.json(db.prepare('SELECT * FROM cards ORDER BY sort_order ASC, id ASC').all());
});

// Reorder: body = { ids: [3, 1, 2] } — ordered array of card ids
router.put('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const db = getDb();
  const update = db.prepare('UPDATE cards SET sort_order=? WHERE id=?');
  db.transaction(() => {
    ids.forEach((id, idx) => update.run(idx, id));
  })();
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { bank, alias, last4, credit_limit, color, profile_id } = req.body;
  if (!bank || !alias) return res.status(400).json({ error: 'bank and alias are required' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO cards (bank, alias, last4, credit_limit, color, profile_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(bank, alias, last4 || null, credit_limit || null, color || '#6366f1', profile_id || null);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(card);
});

router.put('/:id', (req, res) => {
  const { bank, alias, last4, credit_limit, color } = req.body;
  const db = getDb();
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  db.prepare(
    'UPDATE cards SET bank=?, alias=?, last4=?, credit_limit=?, color=? WHERE id=?'
  ).run(
    bank ?? card.bank,
    alias ?? card.alias,
    last4 ?? card.last4,
    credit_limit ?? card.credit_limit,
    color ?? card.color,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
  res.json({ ok: true });
});

export default router;
