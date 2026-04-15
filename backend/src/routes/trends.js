import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

router.get('/', (req, res) => {
  const db = getDb();
  const { profile_id, range } = req.query;

  const cards = profile_id
    ? db.prepare('SELECT * FROM cards WHERE profile_id=? ORDER BY sort_order ASC, id ASC').all(profile_id)
    : db.prepare('SELECT * FROM cards ORDER BY sort_order ASC, id ASC').all();

  if (!cards.length) {
    return res.json({ months: [], cards: [], totals: { charges: [], msiMonthly: [] } });
  }

  const cardIds = cards.map(c => c.id);
  const placeholders = cardIds.map(() => '?').join(',');

  const rows = db.prepare(`
    SELECT
      s.id, s.card_id, s.period_year, s.period_month, s.total_balance,
      COALESCE(SUM(CASE WHEN t.type='charge' THEN t.amount ELSE 0 END), 0) AS charges,
      COALESCE(SUM(CASE WHEN t.type='msi' THEN COALESCE(t.msi_monthly_amount, t.amount) ELSE 0 END), 0) AS msi_monthly
    FROM statements s
    LEFT JOIN transactions t ON t.statement_id = s.id
    WHERE s.card_id IN (${placeholders})
    GROUP BY s.id
    ORDER BY s.period_year ASC, s.period_month ASC
  `).all(...cardIds);

  if (!rows.length) {
    return res.json({ months: [], cards: [], totals: { charges: [], msiMonthly: [] } });
  }

  // Build sorted month axis
  let allMonthKeys = [...new Set(rows.map(r =>
    `${r.period_year}-${String(r.period_month).padStart(2, '0')}`
  ))].sort();

  // Apply range filter (trim oldest months)
  const rangeN = parseInt(range) || 0;
  if (rangeN > 0 && allMonthKeys.length > rangeN) {
    allMonthKeys = allMonthKeys.slice(-rangeN);
  }

  const months = allMonthKeys.map(k => {
    const [y, m] = k.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  });

  // Per-card datasets
  const cardData = cards.map(card => {
    const stmtMap = {};
    rows.filter(r => r.card_id === card.id).forEach(r => {
      const key = `${r.period_year}-${String(r.period_month).padStart(2, '0')}`;
      stmtMap[key] = r;
    });

    const balances   = allMonthKeys.map(k => stmtMap[k]?.total_balance ?? null);
    const charges    = allMonthKeys.map(k => stmtMap[k]?.charges    ?? null);
    const msiMonthly = allMonthKeys.map(k => stmtMap[k]?.msi_monthly ?? null);

    if (balances.every(v => v === null)) return null;

    return { id: card.id, alias: card.alias, color: card.color, bank: card.bank, balances, charges, msiMonthly };
  }).filter(Boolean);

  // Aggregate totals per month
  const totalCharges    = allMonthKeys.map((_, i) => cardData.reduce((s, c) => s + (c.charges[i]    ?? 0), 0));
  const totalMsiMonthly = allMonthKeys.map((_, i) => cardData.reduce((s, c) => s + (c.msiMonthly[i] ?? 0), 0));

  res.json({ months, cards: cardData, totals: { charges: totalCharges, msiMonthly: totalMsiMonthly } });
});

// GET /api/trends/card/:id — time series for a single card
router.get('/card/:id', (req, res) => {
  const db = getDb();
  const card = db.prepare('SELECT * FROM cards WHERE id=?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const rows = db.prepare(`
    SELECT
      s.period_year, s.period_month,
      COALESCE(SUM(CASE WHEN t.type='charge'    THEN t.amount ELSE 0 END), 0) AS charges,
      COALESCE(SUM(CASE WHEN t.type='msi'       THEN COALESCE(t.msi_monthly_amount, t.amount) ELSE 0 END), 0) AS msi_monthly,
      COALESCE(SUM(CASE WHEN t.type='payment'   THEN ABS(t.amount) ELSE 0 END), 0) AS payments,
      COALESCE(SUM(CASE WHEN t.type='interest'  THEN t.amount ELSE 0 END), 0) AS interest
    FROM statements s
    LEFT JOIN transactions t ON t.statement_id = s.id
    WHERE s.card_id = ?
    GROUP BY s.id
    ORDER BY s.period_year ASC, s.period_month ASC
  `).all(card.id);

  const months     = rows.map(r => `${MONTH_NAMES[r.period_month - 1]} ${r.period_year}`);
  const charges    = rows.map(r => r.charges);
  const msiMonthly = rows.map(r => r.msi_monthly);
  const payments   = rows.map(r => r.payments);
  const interest   = rows.map(r => r.interest);

  res.json({ months, charges, msiMonthly, payments, interest });
});

export default router;
