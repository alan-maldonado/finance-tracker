/**
 * Banamex (Banco Nacional de México) statement parser.
 *
 * PDF text extraction layout:
 *
 * HEADER:
 *   "Periodo:\n 21-feb-2026 al 20-mar-2026"
 *   "Fecha de corte:\n20-mar-2026"
 *   "Fecha límite de pago:\n1\njueves, 9-abr-2026"
 *   "Pago mínimo:\n4\n$1,270.00"
 *   "Saldo deudor total:\n11\n \n$ 43,734.11"
 *
 * REGULAR TRANSACTIONS (section "CARGOS, ABONOS Y COMPRAS REGULARES"):
 *   Each transaction spans ~5 lines:
 *     DD-MMM-YYYY        ← operation date
 *     DD-MMM-YYYY        ← charge date
 *     DESCRIPTION        ← may include "NNN de NNN" for MSI monthly payments
 *     +  or  -           ← sign
 *     $X,XXX.XX          ← amount
 *
 * MSI TRANSACTIONS (section "COMPRAS Y CARGOS DIFERIDOS A MESES"):
 *   DD-MMM-YYYY
 *   DESCRIPTION$ORIGINAL$PENDING           ← amounts concatenated
 *   $INTEREST$IVA
 *   $MONTHLY_PAYMENT
 *   X de Y                                 ← installment number
 *   X.XX%
 */

const MONTH_MAP = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

const DATE_RE = /^\d{2}-[a-záéíóú]{3}-\d{4}$/i;
const AMOUNT_RE = /^\$[\d,]+\.\d{2}$/;
const SIGN_RE = /^[+\-]$/;
const MSI_INSTALLMENT_RE = /(\d+)\s+de\s+(\d{3})/i; // "011 de 024" in description

function parseDate(str) {
  const m = str.trim().match(/(\d{1,2})-([a-z]{3})-(\d{4})/i);
  if (!m) return null;
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseAmount(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

function extractPeriod(text) {
  // "Periodo:\n 21-feb-2026 al 20-mar-2026"
  const m = text.match(/Periodo:\s*\n\s*(\d{2}-[a-z]{3}-\d{4})\s+al\s+(\d{2}-[a-z]{3}-\d{4})/i);
  if (m) {
    const cutoffDate = parseDate(m[2]);
    if (cutoffDate) {
      const [year, month] = cutoffDate.split('-').map(Number);
      return { cutoffDate, year, month };
    }
  }
  // Fallback: Fecha de corte
  const m2 = text.match(/Fecha de corte:\s*\n\s*(\d{2}-[a-z]{3}-\d{4})/i);
  if (m2) {
    const cutoffDate = parseDate(m2[1]);
    if (cutoffDate) {
      const [year, month] = cutoffDate.split('-').map(Number);
      return { cutoffDate, year, month };
    }
  }
  return null;
}

function extractDueDate(text) {
  // "Fecha límite de pago:\n1\njueves, 9-abr-2026"
  // Use a loose match to tolerate footnote numbers and day-of-week prefixes
  const m = text.match(/Fecha l[ií]mite de pago[\s\S]{0,50}?(\d{1,2}-[a-z]{3}-\d{4})/i);
  return m ? parseDate(m[1]) : null;
}

function extractSummary(text) {
  // "Pago mínimo:\n4\n$1,270.00"  — footnote number between label and value
  const minMatch = text.match(/Pago m[ií]nimo:\s*\n\s*\d+\s*\n\s*\$\s*([\d,]+\.?\d{0,2})/i);

  // "Saldo deudor total:\n11\n \n$ 43,734.11"
  const totalMatch = text.match(/Saldo deudor total:\s*\n\s*\d+\s*\n[^\n]*\n\s*\$\s*([\d,]+\.?\d{0,2})/i)
    || text.match(/Saldo deudor total:\s*[\s\S]{0,30}?\$\s*([\d,]+\.?\d{0,2})/i);

  // Fallback: "Pago para no generar intereses:\n2\n$3,413.54" (regular balance)
  const regularMatch = text.match(/Pago para no generar intereses:\s*\n\s*\d+\s*\n\s*\$\s*([\d,]+\.?\d{0,2})/i);

  return {
    totalBalance: parseAmount(totalMatch?.[1]) ?? parseAmount(regularMatch?.[1]),
    minimumPayment: parseAmount(minMatch?.[1]),
    noInterestPayment: parseAmount(regularMatch?.[1]),
  };
}

// ---------------------------------------------------------------------------
// Transaction extraction
// ---------------------------------------------------------------------------

/**
 * Determines if a description line belongs to a regular transaction section
 * (not a summary, header, or footnote line).
 */
function isNoise(desc) {
  return /^(total\s+cargos|total\s+abonos|notas:|número de tarjeta|tarjeta titular|fecha de la|página|este documento)/i.test(desc);
}

/**
 * Returns 'interest' if the description is an interest or IVA-on-interest charge,
 * null otherwise.
 */
function interestType(desc) {
  return /^(iva por intereses|interes\s+(?:gravab|exento)|isr\s|intereses?\s+(?:ordinarios|moratorios))/i.test(desc)
    ? 'interest'
    : null;
}

function extractTransactions(text) {
  const transactions = [];
  const lines = text.split('\n').map(l => l.trim());

  // -------------------------------------------------------------------------
  // 1. Parse MSI section: "COMPRAS Y CARGOS DIFERIDOS A MESES"
  // -------------------------------------------------------------------------
  const msiSectionMatch = text.match(
    /COMPRAS Y CARGOS DIFERIDOS A MESES(?:\s+CON|\s+SIN)\s+INTERESES([\s\S]*?)(?=CARGOS, ABONOS Y COMPRAS REGULARES|ATENCIÓN DE QUEJAS|$)/i
  );

  if (msiSectionMatch) {
    const msiLines = msiSectionMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
    let i = 0;
    while (i < msiLines.length) {
      const line = msiLines[i];

      // Skip header/noise
      if (!DATE_RE.test(line)) { i++; continue; }

      const date = parseDate(line);
      if (!date) { i++; continue; }

      // Next line: description + concatenated amounts (e.g. "DISPONIBLE BANAMEX$70,000.00$40,320.57")
      const descLine = msiLines[i + 1] || '';
      // Extract description (text before first $)
      const descMatch = descLine.match(/^([^$]+)/);
      const description = descMatch ? descMatch[1].trim() : descLine;

      // Skip ahead to find "X de Y" line and monthly payment amount
      let msiCurrent = null;
      let msiTotal = null;
      let monthlyAmount = null;

      for (let j = i + 1; j < Math.min(i + 8, msiLines.length); j++) {
        const jLine = msiLines[j];

        // "11 de 24" or "011 de 024"
        const installMatch = jLine.match(/^(\d+)\s+de\s+(\d+)$/i);
        if (installMatch) {
          msiCurrent = parseInt(installMatch[1]);
          msiTotal = parseInt(installMatch[2]);
        }

        // Monthly payment amount line (standalone "$X,XXX.XX" not concatenated)
        if (AMOUNT_RE.test(jLine) && monthlyAmount === null) {
          monthlyAmount = parseAmount(jLine);
        }
      }

      if (description && (monthlyAmount !== null || msiCurrent !== null)) {
        transactions.push({
          date,
          description,
          amount: monthlyAmount ?? 0,
          type: 'msi',
          msiCurrentMonth: msiCurrent,
          msiTotalMonths: msiTotal,
          msiMonthlyAmount: monthlyAmount,
        });
      }

      // Advance past this MSI entry (roughly 6 lines)
      i += 6;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Parse regular section: "CARGOS, ABONOS Y COMPRAS REGULARES"
  // -------------------------------------------------------------------------
  const regularSectionMatch = text.match(
    /CARGOS, ABONOS Y COMPRAS REGULARES \(NO A MESES\)([\s\S]*?)(?=ATENCIÓN DE QUEJAS|DISTRIBUCIÓN DE TU ÚLTIMO PAGO|$)/i
  );

  if (regularSectionMatch) {
    const regLines = regularSectionMatch[1].split('\n').map(l => l.trim()).filter(Boolean);

    let i = 0;
    while (i < regLines.length) {
      const line = regLines[i];

      // Each transaction: date, date, description, sign (+/-), amount
      if (!DATE_RE.test(line)) { i++; continue; }

      const date = parseDate(line);
      if (!date) { i++; continue; }

      // Next must also be a date (charge date)
      if (i + 1 >= regLines.length || !DATE_RE.test(regLines[i + 1])) { i++; continue; }

      const description = regLines[i + 2] || '';
      const signLine = regLines[i + 3] || '';
      const amountLine = regLines[i + 4] || '';

      if (!SIGN_RE.test(signLine) || !AMOUNT_RE.test(amountLine)) { i++; continue; }
      if (isNoise(description)) { i += 5; continue; }

      const amount = parseAmount(amountLine);
      if (amount === null) { i += 5; continue; }

      const isPayment = signLine === '-';

      if (isPayment) {
        transactions.push({ date, description, amount: -amount, type: 'payment' });
      } else {
        // Skip MSI monthly payment duplicates (already captured in MSI section)
        if (MSI_INSTALLMENT_RE.test(description)) { i += 5; continue; }

        const txType = interestType(description) ?? 'charge';
        transactions.push({ date, description, amount, type: txType });
      }

      i += 5;
    }
  }

  return transactions;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseBanamex(text) {
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
