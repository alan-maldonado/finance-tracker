/**
 * Santander Mexico statement parser.
 * Placeholder — implement after reviewing a real PDF.
 */
export function parseSantander(text) {
  return {
    period: extractPeriod(text),
    summary: extractSummary(text),
    transactions: extractTransactions(text),
  };
}

function extractPeriod(text) {
  const m = text.match(/Fecha de corte[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  if (m) {
    const parts = m[1].split('/');
    return {
      cutoffDate: `${parts[2]}-${parts[1]}-${parts[0]}`,
      year: parseInt(parts[2]),
      month: parseInt(parts[1]),
      dueDate: null,
    };
  }
  return null;
}

function extractSummary(text) {
  const balanceMatch = text.match(/Saldo\s+(?:al\s+corte|total)[:\s]+([\d,]+\.?\d{0,2})/i);
  const minMatch = text.match(/Pago\s+m[íi]nimo[:\s]+([\d,]+\.?\d{0,2})/i);
  const parseAmount = s => s ? parseFloat(s.replace(/[$,\s]/g, '')) : null;
  return {
    totalBalance: balanceMatch ? parseAmount(balanceMatch[1]) : null,
    minimumPayment: minMatch ? parseAmount(minMatch[1]) : null,
  };
}

function extractTransactions(text) {
  const transactions = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const parseAmount = s => s ? parseFloat(s.replace(/[$,\s]/g, '')) : null;

  for (const line of lines) {
    const m = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?$/);
    if (!m) continue;
    const [, rawDate, description, col3, col4] = m;
    const parts = rawDate.split('/');
    const date = `${parts[2]}-${parts[1]}-${parts[0]}`;

    const msiMatch = description.match(/(\d+)\s*(?:DE|\/)\s*(\d+)\s*(?:MESES?|MSI)/i);
    if (col4) {
      const amt = parseAmount(col4);
      if (amt) transactions.push({ date, description, amount: -amt, type: 'payment' });
    } else {
      const amount = parseAmount(col3);
      if (amount !== null) {
        if (msiMatch) {
          transactions.push({
            date, description, amount, type: 'msi',
            msiCurrentMonth: parseInt(msiMatch[1]),
            msiTotalMonths: parseInt(msiMatch[2]),
            msiMonthlyAmount: amount,
          });
        } else {
          transactions.push({ date, description, amount, type: 'charge' });
        }
      }
    }
  }
  return transactions;
}
