/**
 * American Express (México) statement parser.
 *
 * PDF text extraction layout:
 *
 * HEADER:
 *   "Período de FacturaciónDel 17 de Marzo al 16 de Abril de 2026"
 *   "Fecha límite de pago:06 de Mayo2026..."  (year may have trailing digits)
 *   Summary table line (single line, separators -, +, =):
 *     "{prevBalance}-{credits}+{newCharges}={newBalance}{minPayment}"
 *
 * TRANSACTION SECTIONS (in this order):
 *   1. "Fecha y Detalle de las operaciones"   → regular charges, payments, MSI installments
 *   2. "Total de las transacciones en $ de…"  → ends section 1
 *   3. (foreign currency charges, no header)  → ends with…
 *   4. "Total de Transacciones en Moneda Extranjera de…"
 *   5. "Transacciones de Meses sin Intereses" → auto-deferred MSI installments
 *   6. "Total de Meses sin Intereses" / "Resumen de Meses sin Intereses" → done
 *
 * TRANSACTION FORMAT:
 *   The date can render as a single line ("30 de MarzoPAGO RECIBIDO…") or split
 *   across two lines ("18 de\nDiciembre"). The amount is either tacked at the end
 *   of the description line (typical for payments / "MONTO A DIFERIR") or on its
 *   own line after the RFC/REF (typical for charges).
 *   "CARGO X DE Y" marks an MSI installment. "CR" marks a credit.
 */

const MONTHS = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, sep: 9, sept: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

const MONTH_NAME_RE = '(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)';
const DATE_LINE_RE        = new RegExp(`^(\\d{1,2})\\s+de\\s+(${MONTH_NAME_RE})(.*)$`, 'i');
const DATE_PARTIAL_RE     = /^(\d{1,2})\s+de\s*$/i;
// Constrain the integer part to 1–3 digits with optional comma-thousands. Without
// this, page-break artifacts like "REF102069515619499.00" produce 15-digit "amounts".
const AMOUNT_NUM          = '\\d{1,3}(?:,\\d{3})*\\.\\d{2}';
const AMOUNT_TAIL_RE      = new RegExp(`^(.*?)(${AMOUNT_NUM})\\s*$`);
const AMOUNT_ONLY_RE      = new RegExp(`^(${AMOUNT_NUM})$`);
const MSI_RE              = /CARGO\s+(\d+)\s+DE\s+(\d+)/i;
const RFC_REF_RE          = /^RFC[A-Z0-9]+\s*\/REF/i;
const FX_LINE_RE          = /^D[óo]lar\b|^Euro\b|TC:\s*\d/i;

// Page-header noise that interleaves with the transaction lines. The patterns are
// kept narrow to avoid swallowing real transactions (e.g. lines starting "PAGO RECIBIDO").
const NOISE_LINE_RE = /^(Estado de Cuenta|P[áa]gina\b|N[úu]mero de Cuenta|Tarjetahabiente|Este no es un documento|Fecha y Detalle de las operaciones|Importe en MN|Descripci[óo]n de compras|Intereses y de Meses|Consolidado de compras|Mensualidad=|3717-)/i;
// Header line carrying cutoff dates in "DD-Mmm-YYYY" form (e.g. "16-Dic-2025 16-Ene-2026").
const HEADER_DATE_RE = /\b\d{1,2}-[A-Za-z]{3}-\d{4}\b/;

function parseAmount(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

function pad(n) { return String(n).padStart(2, '0'); }

function normalizeMonth(name) {
  if (!name) return null;
  return MONTHS[name.toLowerCase().replace(/\.$/, '')] || null;
}

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

function extractPeriod(text) {
  // "Período de FacturaciónDel 17 de Marzo al 16 de Abril de 2026"
  const m = text.match(
    new RegExp(`Per[íi]odo de Facturaci[óo]n\\s*Del\\s+\\d{1,2}\\s+de\\s+(${MONTH_NAME_RE})\\s+al\\s+(\\d{1,2})\\s+de\\s+(${MONTH_NAME_RE})\\s+de\\s+(\\d{4})`, 'i')
  );
  if (m) {
    const month = normalizeMonth(m[3]);
    if (month) {
      const year = parseInt(m[4], 10);
      const day = parseInt(m[2], 10);
      return { cutoffDate: `${year}-${pad(month)}-${pad(day)}`, year, month };
    }
  }
  // Fallback: header "DD-Mon-YYYY"
  const m2 = text.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m2) {
    const month = normalizeMonth(m2[2]);
    if (month) {
      const year = parseInt(m2[3], 10);
      const day = parseInt(m2[1], 10);
      return { cutoffDate: `${year}-${pad(month)}-${pad(day)}`, year, month };
    }
  }
  return null;
}

function extractDueDate(text, period) {
  // "Fecha límite de pago:06 de Mayo2026..." (extra digits may follow the year)
  const m = text.match(
    new RegExp(`Fecha l[ií]mite de pago:?\\s*(\\d{1,2})\\s+de\\s+(${MONTH_NAME_RE})\\s*(\\d{4})`, 'i')
  );
  if (m) {
    const month = normalizeMonth(m[2]);
    if (month) return `${m[3]}-${pad(month)}-${pad(parseInt(m[1], 10))}`;
  }
  // Fallback without explicit year — infer from period.
  const m2 = text.match(
    new RegExp(`Fecha l[ií]mite de pago:?\\s*(\\d{1,2})\\s+de\\s+(${MONTH_NAME_RE})\\b`, 'i')
  );
  if (m2 && period) {
    const month = normalizeMonth(m2[2]);
    if (month) {
      // Due date is on or after the cutoff, so it's typically the next month.
      // If the due month is earlier in the year than the cutoff, it rolls into next year.
      let year = period.year;
      if (month < period.month) year += 1;
      return `${year}-${pad(month)}-${pad(parseInt(m2[1], 10))}`;
    }
  }
  return null;
}

function extractSummary(text) {
  // Summary table line: "prev-credits+charges=balance min"
  const m = text.match(/([\d,]+\.\d{2})\s*-\s*([\d,]+\.\d{2})\s*\+\s*([\d,]+\.\d{2})\s*=\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})/);
  if (m) {
    const balance = parseAmount(m[4]);
    return {
      totalBalance: balance,
      minimumPayment: parseAmount(m[5]),
      noInterestPayment: balance,
    };
  }
  // Fallback: labelled values.
  const minMatch = text.match(/Pago M[íi]nimo:\s*\$?\s*([\d,]+\.\d{2})/i);
  const noIntMatch = text.match(/Pago para no\s*generar intereses[\s:]*\$?\s*([\d,]+\.\d{2})/i);
  return {
    totalBalance: parseAmount(noIntMatch?.[1]),
    minimumPayment: parseAmount(minMatch?.[1]),
    noInterestPayment: parseAmount(noIntMatch?.[1]),
  };
}

// ---------------------------------------------------------------------------
// Transaction extraction
// ---------------------------------------------------------------------------

/**
 * Merge "DD de\nMonth" pairs into a single line so the date regex always sees
 * the full "DD de Month" token regardless of how the PDF laid it out.
 */
function preprocessLines(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const partial = lines[i].match(DATE_PARTIAL_RE);
    if (partial && i + 1 < lines.length) {
      const next = lines[i + 1];
      const monthMatch = next.match(new RegExp(`^(${MONTH_NAME_RE})(.*)$`, 'i'));
      if (monthMatch) {
        out.push(`${partial[1]} de ${monthMatch[1]}${monthMatch[2]}`);
        i++;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

function inferYear(month, period) {
  // Transactions span (period.month - 1) → period.month. A month value greater
  // than period.month means the previous calendar year (Dec txn in Jan period).
  if (month > period.month) return period.year - 1;
  return period.year;
}

function extractTransactions(text, period) {
  if (!period) return [];

  const lines = preprocessLines(text);
  const transactions = [];

  // States: SKIP, REGULAR, FX, SKIP_BETWEEN, MSI_AUTO, DONE
  let mode = 'SKIP';
  let pending = null;

  function flush() {
    if (!pending) return;
    if (pending.amount == null) { pending = null; return; }

    const description = pending.descriptionLines
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!description) { pending = null; return; }

    let amount = pending.amount;
    let type = 'charge';
    if (pending.isCredit) {
      amount = -amount;
      type = 'payment';
    } else if (pending.msi) {
      type = 'msi';
    }

    const tx = { date: pending.date, description, amount, type };
    if (pending.msi && pending.msi.current) {
      tx.msiCurrentMonth = pending.msi.current;
      tx.msiTotalMonths = pending.msi.total;
      tx.msiMonthlyAmount = Math.abs(amount);
    }
    transactions.push(tx);
    pending = null;
  }

  for (const line of lines) {
    // Section transitions ----------------------------------------------------
    if (/^Total Nuevos Cargos\b/i.test(line) || /^Fecha y Detalle de las operaciones/i.test(line)) {
      if (mode === 'SKIP') mode = 'REGULAR';
      continue;
    }
    if (/^Total de las transacciones en\s*\$/i.test(line)) {
      flush();
      if (mode === 'REGULAR') mode = 'FX';
      continue;
    }
    if (/^Total de Transacciones en Moneda Extranjera/i.test(line)) {
      flush();
      mode = 'SKIP_BETWEEN';
      continue;
    }
    if (/^Transacciones de Meses sin Intereses/i.test(line)) {
      flush();
      mode = 'MSI_AUTO';
      continue;
    }
    if (/^Total de Meses sin Intereses/i.test(line) || /^Resumen de Meses sin Intereses/i.test(line)) {
      flush();
      mode = 'DONE';
      continue;
    }

    if (mode === 'SKIP' || mode === 'SKIP_BETWEEN' || mode === 'DONE') continue;

    if (NOISE_LINE_RE.test(line) || HEADER_DATE_RE.test(line)) continue;

    // Transaction parsing ----------------------------------------------------
    const dateMatch = line.match(DATE_LINE_RE);
    if (dateMatch) {
      const month = normalizeMonth(dateMatch[2]);
      if (!month) continue;

      flush();

      const day = parseInt(dateMatch[1], 10);
      const year = inferYear(month, period);
      let rest = (dateMatch[3] || '').trim();

      let inlineAmount = null;
      const tail = rest.match(AMOUNT_TAIL_RE);
      if (tail) {
        rest = tail[1].trim();
        inlineAmount = parseAmount(tail[2]);
      }

      pending = {
        date: `${year}-${pad(month)}-${pad(day)}`,
        descriptionLines: rest ? [rest] : [],
        amount: inlineAmount,
        isCredit: false,
        msi: null,
      };
      continue;
    }

    if (!pending) continue;

    if (/^CR$/i.test(line)) {
      pending.isCredit = true;
      continue;
    }

    const msiMatch = line.match(MSI_RE);
    if (msiMatch) {
      pending.msi = { current: parseInt(msiMatch[1], 10), total: parseInt(msiMatch[2], 10) };
      continue;
    }

    if (RFC_REF_RE.test(line)) {
      // RFC/REF lines occasionally have the amount glued at the end (page break artifact).
      if (pending.amount == null) {
        const tail = line.match(AMOUNT_TAIL_RE);
        if (tail) pending.amount = parseAmount(tail[2]);
      }
      continue;
    }

    const amtOnly = line.match(AMOUNT_ONLY_RE);
    if (amtOnly) {
      if (pending.amount == null) pending.amount = parseAmount(amtOnly[1]);
      continue;
    }

    // Description-with-trailing-amount line.
    const tail = line.match(AMOUNT_TAIL_RE);
    if (tail && pending.amount == null) {
      const desc = tail[1].trim();
      if (desc) pending.descriptionLines.push(desc);
      pending.amount = parseAmount(tail[2]);
      continue;
    }

    if (FX_LINE_RE.test(line) || line.length > 0) {
      pending.descriptionLines.push(line);
    }
  }

  flush();
  return transactions;
}

// ---------------------------------------------------------------------------

export function parseAmex(text) {
  const period = extractPeriod(text);
  const dueDate = extractDueDate(text, period);
  const summary = extractSummary(text);
  const transactions = extractTransactions(text, period);

  return {
    period: period ? { ...period, dueDate } : null,
    summary,
    transactions,
  };
}
