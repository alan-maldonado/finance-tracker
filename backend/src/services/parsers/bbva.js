/**
 * BBVA Mexico statement parser.
 *
 * BBVA PDFs typically contain:
 * - Header with "BBVA" and account holder info
 * - Period line: "Periodo del DD/MM/AAAA al DD/MM/AAAA"
 * - Payment due: "Fecha límite de pago: DD/MM/AAAA"
 * - Transactions table with columns: Fecha | Descripción | Cargos | Abonos
 * - MSI lines show "X DE Y MESES" or "MSI" in the description
 * - Summary at bottom: "Saldo total" and "Pago mínimo"
 */

const MONTH_MAP = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

function parseAmount(str) {
  if (!str) return null;
  const clean = str.replace(/[$,\s]/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseDate(str) {
  if (!str) return null;
  // DD/MM/AAAA
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // DD MMM AAAA
  const m2 = str.match(/(\d{1,2})\s+([A-Z]{3,})\s+(\d{4})/i);
  if (m2) {
    const month = MONTH_MAP[m2[2].toUpperCase()];
    if (month) return `${m2[3]}-${String(month).padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  }
  return null;
}

function extractPeriod(text) {
  // "Periodo del DD/MM/AAAA al DD/MM/AAAA" or "Del DD/MM/AAAA al DD/MM/AAAA"
  const m = text.match(/(?:Periodo del|Del)\s+(\d{2}\/\d{2}\/\d{4})\s+al\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (m) {
    const cutoff = parseDate(m[2]);
    const parts = cutoff.split('-');
    return {
      cutoffDate: cutoff,
      year: parseInt(parts[0]),
      month: parseInt(parts[1]),
    };
  }
  // Fallback: look for "Fecha de corte: DD/MM/AAAA"
  const m2 = text.match(/Fecha de corte[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  if (m2) {
    const cutoff = parseDate(m2[1]);
    const parts = cutoff.split('-');
    return { cutoffDate: cutoff, year: parseInt(parts[0]), month: parseInt(parts[1]) };
  }
  return null;
}

function extractDueDate(text) {
  const m = text.match(/Fecha l[ií]mite de pago[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  return m ? parseDate(m[1]) : null;
}

function extractSummary(text) {
  const balanceMatch = text.match(/Saldo\s+(?:total|a\s+pagar)[:\s]+([\d,]+\.?\d{0,2})/i);
  const minMatch = text.match(/Pago\s+m[íi]nimo[:\s]+([\d,]+\.?\d{0,2})/i);
  return {
    totalBalance: balanceMatch ? parseAmount(balanceMatch[1]) : null,
    minimumPayment: minMatch ? parseAmount(minMatch[1]) : null,
  };
}

function detectMSI(description) {
  // "2 DE 12 MESES", "3/18 MSI", "MSI 3 DE 6", "3 de 6 meses sin intereses"
  const m = description.match(/(\d+)\s*(?:DE|\/)\s*(\d+)\s*(?:MESES?|MSI)/i)
    || description.match(/MSI\s+(\d+)\s+DE\s+(\d+)/i);
  if (m) return { current: parseInt(m[1]), total: parseInt(m[2]) };
  if (/MSI|MESES\s+SIN\s+INTER[EÉ]S/i.test(description)) return { current: null, total: null };
  return null;
}

function extractTransactions(text) {
  const transactions = [];

  // Split into lines and look for transaction patterns
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Transaction line pattern: starts with DD/MM or DD MMM, has description, has amount
  // BBVA format: "14/01 AMAZON PRIME 00120.00"
  // or multiline with charge and payment in separate columns
  const txPattern = /^(\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})$/;
  const txPatternFull = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?$/;

  let currentYear = null;
  const yearMatch = text.match(/\d{4}/);
  if (yearMatch) currentYear = yearMatch[0];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/footer lines
    if (/^(Fecha|Descripci[oó]n|Cargos|Abonos|Saldo|Total|Pago|TOTAL)/i.test(line)) continue;

    // Full date format: DD/MM/AAAA
    let match = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?$/);
    if (match) {
      const date = parseDate(match[1]);
      const description = match[2].trim();
      const chargeStr = match[3];
      const paymentStr = match[4];

      if (paymentStr) {
        // Has both charge and payment columns — this is a payment row
        const payAmount = parseAmount(paymentStr);
        if (payAmount) {
          transactions.push({ date, description, amount: -payAmount, type: 'payment' });
        }
      } else {
        const amount = parseAmount(chargeStr);
        if (amount !== null) {
          const msi = detectMSI(description);
          if (msi) {
            transactions.push({
              date, description, amount, type: 'msi',
              msiCurrentMonth: msi.current,
              msiTotalMonths: msi.total,
              msiMonthlyAmount: amount,
            });
          } else {
            transactions.push({ date, description, amount, type: 'charge' });
          }
        }
      }
      continue;
    }

    // Short date format: DD/MM (infer year from statement period)
    match = line.match(/^(\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?$/);
    if (match && currentYear) {
      const date = parseDate(`${match[1]}/${currentYear}`);
      const description = match[2].trim();
      const chargeStr = match[3];
      const paymentStr = match[4];

      if (paymentStr) {
        const payAmount = parseAmount(paymentStr);
        if (payAmount) {
          transactions.push({ date, description, amount: -payAmount, type: 'payment' });
        }
      } else {
        const amount = parseAmount(chargeStr);
        if (amount !== null) {
          const msi = detectMSI(description);
          if (msi) {
            transactions.push({
              date, description, amount, type: 'msi',
              msiCurrentMonth: msi.current,
              msiTotalMonths: msi.total,
              msiMonthlyAmount: amount,
            });
          } else {
            transactions.push({ date, description, amount, type: 'charge' });
          }
        }
      }
    }
  }

  return transactions;
}

export function parseBBVA(text) {
  const period = extractPeriod(text);
  const dueDate = extractDueDate(text);
  const summary = extractSummary(text);
  const transactions = extractTransactions(text);

  return {
    period: period ? { ...period, dueDate } : null,
    summary,
    transactions,
  };
}
