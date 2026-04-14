import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM profiles ORDER BY created_at ASC').all());
});

router.post('/', (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO profiles (name, color) VALUES (?, ?)').run(name.trim(), color || '#6366f1');
  res.status(201).json(db.prepare('SELECT * FROM profiles WHERE id=?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const db = getDb();
  const profile = db.prepare('SELECT * FROM profiles WHERE id=?').get(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  db.prepare('UPDATE profiles SET name=?, color=? WHERE id=?').run(name.trim(), color || profile.color, req.params.id);
  res.json(db.prepare('SELECT * FROM profiles WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const others = db.prepare('SELECT COUNT(*) as n FROM profiles WHERE id != ?').get(req.params.id);
  if (others.n === 0) return res.status(400).json({ error: 'Cannot delete the last profile' });
  db.prepare('DELETE FROM profiles WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
