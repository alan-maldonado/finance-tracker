import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// GET /api/msi
// Returns active MSI plans + charges + manual entries from the latest statement of each card.
router.get('/', (req, res) => {
  const db = getDb();
  const cards = db.prepare('SELECT * FROM cards ORDER BY sort_order ASC, id ASC').all();

  const result = cards.map(card => {
    const statement = db.prepare(`
      SELECT * FROM statements
      WHERE card_id = ?
      ORDER BY period_year DESC, period_month DESC
      LIMIT 1
    `).get(card.id);

    if (!statement) return null;

    // MSI plans
    const plans = db.prepare(`
      SELECT * FROM transactions
      WHERE statement_id = ? AND type = 'msi'
      ORDER BY date ASC
    `).all(statement.id);

    const plansWithCalc = plans.map(p => {
      const monthly = p.msi_monthly_amount ?? p.amount;
      const remaining = p.msi_total_months != null && p.msi_current_month != null
        ? p.msi_total_months - p.msi_current_month
        : null;
      return { ...p, remaining_months: remaining, remaining_amount: remaining != null ? monthly * remaining : null };
    });

    // One-time charges
    const charges = db.prepare(`
      SELECT * FROM transactions
      WHERE statement_id = ? AND type = 'charge'
      ORDER BY date ASC
    `).all(statement.id);

    // Interest / IVA — summed into a single value per card
    const interestRows = db.prepare(`
      SELECT * FROM transactions
      WHERE statement_id = ? AND type = 'interest'
    `).all(statement.id);
    const totalInterest = interestRows.reduce((s, t) => s + t.amount, 0);

    // Manual entries for this statement's period (payments are negative amounts)
    const manualEntries = db.prepare(`
      SELECT * FROM manual_entries
      WHERE card_id = ? AND year = ? AND month = ?
      ORDER BY created_at ASC
    `).all(card.id, statement.period_year, statement.period_month);

    // Due date month for placing charges and manual entries in the right column
    let dueYear = statement.period_year;
    let dueMonth = statement.period_month + 1;
    if (dueMonth > 12) { dueMonth = 1; dueYear++; }
    if (statement.payment_due_date) {
      const [y, m] = statement.payment_due_date.split('-').map(Number);
      dueYear = y; dueMonth = m;
    }

    const totalMonthly = plansWithCalc.reduce((s, p) => s + (p.msi_monthly_amount ?? p.amount), 0);
    const totalRemaining = plansWithCalc.reduce((s, p) => s + (p.remaining_amount ?? 0), 0);
    const totalCharges = charges.reduce((s, c) => s + c.amount, 0);
    const manualBalance = manualEntries.reduce((s, e) => s + e.amount, 0); // negative = payments

    if (!plansWithCalc.length && !charges.length && !totalInterest) return null;

    return {
      card,
      statement: {
        id: statement.id,
        period_year: statement.period_year,
        period_month: statement.period_month,
        payment_due_date: statement.payment_due_date,
        due_year: dueYear,
        due_month: dueMonth,
      },
      plans: plansWithCalc,
      charges,
      manualEntries,
      totalInterest,
      totalMonthly,
      totalRemaining,
      totalCharges,
      manualBalance,
    };
  }).filter(Boolean);

  const grandTotalMonthly = result.reduce((s, c) => s + c.totalMonthly, 0);
  const grandTotalRemaining = result.reduce((s, c) => s + c.totalRemaining, 0);
  const grandTotalCharges = result.reduce((s, c) => s + c.totalCharges, 0);
  const grandManualBalance = result.reduce((s, c) => s + c.manualBalance, 0);

  res.json({ cards: result, grandTotalMonthly, grandTotalRemaining, grandTotalCharges, grandManualBalance });
});

export default router;
