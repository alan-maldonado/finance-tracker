import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// GET /api/dashboard?year=2024&month=3
// Groups statements by payment_due_date month, not period month.
router.get('/', (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month are required' });

  const db = getDb();
  const cards = db.prepare('SELECT * FROM cards ORDER BY sort_order ASC, id ASC').all();

  const mm = String(month).padStart(2, '0');

  const result = cards.map(card => {
    // Statement whose payment is due in the requested year/month
    const statement = db.prepare(`
      SELECT * FROM statements
      WHERE card_id = ?
        AND strftime('%Y', payment_due_date) = ?
        AND strftime('%m', payment_due_date) = ?
      ORDER BY period_year DESC, period_month DESC
      LIMIT 1
    `).get(card.id, String(year), mm);

    let transactions = [];
    if (statement) {
      transactions = db.prepare(
        'SELECT * FROM transactions WHERE statement_id=? ORDER BY date ASC'
      ).all(statement.id);
    }

    // Next statement (immediately following period) — if it exists, actual payments are there
    const nextStatement = statement
      ? db.prepare(`
          SELECT s.id FROM statements s
          WHERE s.card_id = ?
            AND (s.period_year > ? OR (s.period_year = ? AND s.period_month > ?))
          ORDER BY s.period_year ASC, s.period_month ASC
          LIMIT 1
        `).get(card.id, statement.period_year, statement.period_year, statement.period_month)
      : null;

    let paidInNextStatement = 0;
    if (nextStatement) {
      const nextPayments = db.prepare(`
        SELECT amount FROM transactions
        WHERE statement_id = ? AND type = 'payment'
      `).all(nextStatement.id);
      paidInNextStatement = Math.abs(nextPayments.reduce((s, t) => s + t.amount, 0));
    }

    // Manual entries keyed to the statement's period
    const manualEntries = statement
      ? db.prepare(
          'SELECT * FROM manual_entries WHERE card_id=? AND year=? AND month=?'
        ).all(card.id, statement.period_year, statement.period_month)
      : [];

    const charges  = transactions.filter(t => t.type === 'charge');
    const msiTxs   = transactions.filter(t => t.type === 'msi');
    const payments  = transactions.filter(t => t.type === 'payment');

    const totalCharges    = charges.reduce((s, t) => s + t.amount, 0);
    const totalMsiMonthly = msiTxs.reduce((s, t) => s + (t.msi_monthly_amount || t.amount), 0);
    const totalPayments   = Math.abs(payments.reduce((s, t) => s + t.amount, 0));
    const manualBalance   = manualEntries.reduce((s, e) => s + e.amount, 0);

    const statementBalance = statement?.total_balance ?? null;
    const projectedBalance = statementBalance !== null
      ? statementBalance + manualBalance
      : null;

    const noInterestPayment = statement?.no_interest_payment ?? null;
    let noInterestRemaining = null;
    if (noInterestPayment !== null) {
      if (nextStatement) {
        // Real payments from next statement are the source of truth
        noInterestRemaining = Math.max(0, noInterestPayment - paidInNextStatement);
      } else {
        // No next statement yet — use manual entries as estimate
        noInterestRemaining = noInterestPayment + manualBalance;
      }
    }

    return {
      card,
      statement: statement ? {
        id: statement.id,
        period_year: statement.period_year,
        period_month: statement.period_month,
        cutoff_date: statement.cutoff_date,
        payment_due_date: statement.payment_due_date,
        minimum_payment: statement.minimum_payment,
        total_balance: statement.total_balance,
        no_interest_payment: statement.no_interest_payment ?? null,
      } : null,
      summary: {
        totalCharges,
        totalMsiMonthly,
        totalPayments,
        manualBalance,
        projectedBalance,
        noInterestRemaining,
        hasNextStatement: !!nextStatement,
        paidInNextStatement: nextStatement ? paidInNextStatement : null,
        transactionCount: transactions.length,
        manualEntryCount: manualEntries.length,
      },
      transactions,
      manualEntries,
    };
  });

  res.json({ year: parseInt(year), month: parseInt(month), cards: result });
});

export default router;
