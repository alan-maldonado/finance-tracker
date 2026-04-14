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

  // -------------------------------------------------------------------------
  // 1. Parse MSI sections: "DIFERIDOS A MESES (SIN|CON) INTERESES"
  //
  //    After Y-coordinate grouping by pdf-parser, each entry is ONE line:
  //      DD-MMM-YYYYDescription text here$ORIGINAL$SALDO[$INT][$IVA]$PAGO_REQN de M[NA|X%]
  //
  //    Strategy: match date at start, description up to first $,
  //              collect all $amounts, then "N de M".
  //              Last amount = pago requerido (monthly payment).
  // -------------------------------------------------------------------------

  const msiSectionMatch = text.match(
    /DIFERIDOS\s+A\s+MESES[\s\S]*?(?=CARGOS,\s*ABONOS\s*Y\s*COMPRAS\s*REGULARES|ATENCIÓN\s+DE\s+QUEJAS|$)/i
  );

  if (msiSectionMatch) {
    for (const line of msiSectionMatch[0].split('\n')) {
      // Each valid entry starts with a date immediately followed by description (no space between)
      const m = line.match(/^(\d{2}-[a-záéíóú]{3}-\d{4})([^$]+)((?:\$[\d,]+\.\d{2})+)\s*(\d+)\s+de\s+(\d+)/i);
      if (!m) continue;

      const date = parseDate(m[1]);
      if (!date) continue;

      const description = m[2].trim();
      const msiCurrent  = parseInt(m[4]);
      const msiTotal    = parseInt(m[5]);

      // Extract all amounts; last one is "pago requerido"
      const amounts = [...m[3].matchAll(/\$([\d,]+\.\d{2})/g)].map(a => parseAmount(a[1]));
      const monthlyAmount = amounts.length ? amounts[amounts.length - 1] : null;

      if (description && msiCurrent !== null) {
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
    }
  }

  // -------------------------------------------------------------------------
  // 1b. Parse CON INTERESES section (multi-line format, different from SIN INTERESES)
  //
  //    Each entry spans ~6 lines:
  //      DD-MMM-YYYY                          ← date (alone)
  //      Description$ORIGINAL$SALDO           ← desc + first two amounts
  //      $INTEREST$IVA                        ← period interest amounts
  //      $MONTHLY_PAYMENT                     ← pago requerido
  //      N de M                               ← installment
  //      X.XX%                                ← rate (ignored)
  // -------------------------------------------------------------------------

  const conInteresesMatch = text.match(
    /COMPRAS Y CARGOS DIFERIDOS A MESES CON INTERESES([\s\S]*?)(?=CARGOS,\s*ABONOS\s*Y\s*COMPRAS\s*REGULARES|ATENCIÓN\s+DE\s+QUEJAS|$)/i
  );

  if (conInteresesMatch) {
    const conLines = conInteresesMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
    let i = 0;
    while (i < conLines.length) {
      if (!DATE_RE.test(conLines[i])) { i++; continue; }

      const date = parseDate(conLines[i]);
      if (!date) { i++; continue; }

      let description = null;
      const allAmounts = [];
      let msiCurrent = null, msiTotal = null;
      let j = i + 1;

      while (j < conLines.length && j < i + 12) {
        const cl = conLines[j];

        // "N de M" line ends the entry
        const installM = cl.match(/^(\d+)\s+de\s+(\d+)$/i);
        if (installM) {
          msiCurrent = parseInt(installM[1]);
          msiTotal   = parseInt(installM[2]);
          j++;
          break;
        }

        // Collect $ amounts
        const amts = [...cl.matchAll(/\$([\d,]+\.\d{2})/g)].map(a => parseAmount(a[1]));
        allAmounts.push(...amts);

        // Description: text before the first $ on the first amount-containing line
        if (!description && amts.length > 0) {
          const descM = cl.match(/^([^$]+)\$/);
          if (descM) description = descM[1].trim();
        }

        j++;
      }

      if (msiCurrent !== null && description && allAmounts.length > 0) {
        // Last collected amount is "pago requerido" (monthly installment)
        const monthlyAmount = allAmounts[allAmounts.length - 1];
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

      i = j; // advance past this entry
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

function estimateDueDate(cutoffDate) {
  // Banamex typically gives ~20 days from cutoff to due date.
  // Used as fallback when the PDF shows no due date (e.g. $0 owed).
  const d = new Date(cutoffDate + 'T00:00:00');
  d.setDate(d.getDate() + 20);
  return d.toISOString().slice(0, 10);
}

export function parseBanamex(text) {
  const period = extractPeriod(text);
  const dueDate = extractDueDate(text);
  const summary = extractSummary(text);
  const transactions = extractTransactions(text);

  // When $0 is owed the PDF leaves the due-date field blank.
  // Estimate it so the dashboard places the statement in the correct month.
  const resolvedDueDate = dueDate ?? (period?.cutoffDate ? estimateDueDate(period.cutoffDate) : null);

  return {
    period: period ? { ...period, dueDate: resolvedDueDate } : null,
    summary,
    transactions,
  };
}
