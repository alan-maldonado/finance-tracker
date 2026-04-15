/**
 * Liverpool (El Puerto de Liverpool) statement parser.
 *
 * Liverpool PDFs use a custom font encoding with no ToUnicode CMap.
 * Text extraction requires PyMuPDF (fitz) as a subprocess, which produces
 * characters in the Latin Extended range that we then decode via a fixed table.
 *
 * Decoded text structure:
 *
 * HEADER (page 1):
 *   FECHA LIMITE DE PAGO D-MMM-YYYY
 *   FECHA DE CORTE D-MMM-YYYY
 *   SALDO ACTUAL AL CORTE XX,XXX.XX
 *   PAGO MINIMO $ XX.XX
 *   PAGO MINIMO + MESES SIN INTERESES $X,XXX.XX
 *   PAGO PARA NO GENERAR INTERESES X,XXX.XX
 *
 * DETALLE DE MOVIMIENTOS (page 2+):
 *   DD-MMM[StoreCode][Description] [Amount]
 *   DD-MMM  SU PAGO SPEI
 *   -X,XXX.XX
 *
 * RESUMEN DE PLANES CON INTERESES:
 *   DD-MMM[StoreCode] Description  [Saldo] [Mensualidad] [Interés] [CargoMes]
 *
 * RESUMEN DE PLANES MENSUALIDADES SIN INTERESES:
 *   DD-MMM[StoreCode][NN] MENS SIN INTERESES  [Saldo] [0.0] [CargoMes] [Total]
 */

// ---------------------------------------------------------------------------
// Character decode table
// Liverpool fonts encode uppercase letters as Latin-Extended unicode points:
//   A-I → U+00C1-U+00C9 (offset +0x80)
//   J-R → U+00D1-U+00D9 (offset +0x87)
//   S-Z → U+00E2-U+00E9 (offset +0x8F)
//   0-9 → U+00F0-U+00F9 (ð-ù)
// Special glyphs: @ = space, K = '.', k = ',', ` = '-', 'a' = 'IN ' (ligature)
// ---------------------------------------------------------------------------

const DM = {
  '\xC1':'A','\xC2':'B','\xC3':'C','\xC4':'D','\xC5':'E',
  '\xC6':'F','\xC7':'G','\xC8':'H','\xC9':'I',
  '\xD1':'J','\xD2':'K','\xD3':'L','\xD4':'M','\xD5':'N',
  '\xD6':'O','\xD7':'P','\xD8':'Q','\xD9':'R',
  '\xE2':'S','\xE3':'T','\xE4':'U','\xE5':'V',
  '\xE6':'W','\xE7':'X','\xE8':'Y','\xE9':'Z',
  '\xF0':'0','\xF1':'1','\xF2':'2','\xF3':'3','\xF4':'4',
  '\xF5':'5','\xF6':'6','\xF7':'7','\xF8':'8','\xF9':'9',
  '@': ' ',
  'K': '.',   // decimal point
  'k': ',',   // thousands separator
  '\x60': '-', // backtick = hyphen
  '\\': '$',
  'N': '+',   // ASCII N = plus sign
  'u': 'I',   // alternate glyph for Í
  'q': 'E',   // alternate glyph for É
  'a': 'IN ', // ligature for "IN " (appears in "SIN INTERESES")
};

export function decodeLiverpool(s) {
  let r = '';
  for (const c of s) r += DM[c] ?? c;
  return r;
}

const MONTH_MAP = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

function parseDate(dayMonth, year, cutoffMonth) {
  const m = (dayMonth || '').match(/(\d{1,2})-([A-Z]{3})/i);
  if (!m) return null;
  const month = MONTH_MAP[m[2].toUpperCase()];
  if (!month) return null;
  // If the transaction month is later than the cutoff month it belongs to the prior year
  // (e.g. a December charge on a January cutoff statement)
  const y = cutoffMonth && month > cutoffMonth ? year - 1 : year;
  return `${y}-${String(month).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}

function parseDateFull(str) {
  const m = (str || '').match(/(\d{1,2})-([A-Z]{3})-(\d{4})/i);
  if (!m) return null;
  const month = MONTH_MAP[m[2].toUpperCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}

function parseAmount(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Main parser (receives already-decoded text)
// ---------------------------------------------------------------------------

export function parseLiverpool(text) {
  // ── Header ────────────────────────────────────────────────────────────────
  // Values appear on the same "line" as labels but may have arbitrary junk between
  // them (other columns printed at the same Y position by the PDF generator).
  const cutoffM  = text.match(/FECHA DE CORTE[\s\S]{0,80}?(\d{1,2}-[A-Z]{3}-\d{4})/i);
  const dueM     = text.match(/FECHA LIMITE DE PAGO[\s\S]{0,80}?(\d{1,2}-[A-Z]{3}-\d{4})/i);
  // Amount is concatenated immediately after the label (no space)
  const balanceM   = text.match(/SALDO ACTUAL AL CORTE\s*([\d,]+\.?\d*)/i);
  const minM       = text.match(/PAGO MINIMO\s+\$\s*([\d,]+\.?\d*)/i);
  const minMsiM    = text.match(/PAGO\s+MINIMO\s*\+\s*MESES\s+SIN\s+INTERESES\s*\$*\s*([\d,]+\.?\d*)/i);
  const noIntM     = text.match(/PAGO PARA NO GENERAR INTERESES\s*([\d,]+\.?\d*)/i);

  // Fallback: some PDFs encode header labels in body-text font (undecodable).
  // The DETALLE header line is always in display-font and carries the cutoff date.
  const detalleCutoffM = !cutoffM
    ? text.match(/DETALLE\s+DE\s+MOVIMIENTOS\s+DEL\s+\d{1,2}-[A-Z]{3}-\d{4}\s+AL\s+(\d{1,2}-[A-Z]{3}-\d{4})/i)
    : null;

  const cutoffDate = cutoffM ? parseDateFull(cutoffM[1])
    : detalleCutoffM          ? parseDateFull(detalleCutoffM[1])
    : null;
  const dueDate    = dueM     ? parseDateFull(dueM[1])     : null;

  let period = null;
  if (cutoffDate) {
    const [year, month] = cutoffDate.split('-').map(Number);
    period = { year, month, cutoffDate, dueDate };
  }

  // ── Issuance date period adjustment ────────────────────────────────────────
  // Liverpool statements include a folio line with the format:
  //   F[z] YYYYMMDD[folio_suffix] DD [garbled-month] YYYY^
  // The YYYYMMDD encodes the cutoff date; the "DD ... YYYY" is the issuance date.
  // When cutoff falls at month-end (e.g. Jan 28) the statement is issued in the
  // following month (e.g. Feb 1). The cover page shows "1 de Febrero de 2026",
  // so the user refers to it as the February statement.
  // Detection: if issuance_day < cutoff_day, the statement crossed a month boundary.
  if (period) {
    const folioM = text.match(/F[^\s\d]{0,5}\s+(\d{4})(\d{2})(\d{2})\d+\s+(\d{1,2})\s+/);
    if (folioM) {
      const cutoffDay  = parseInt(folioM[3]);
      const issuanceDay = parseInt(folioM[4]);
      if (issuanceDay < cutoffDay) {
        let m = period.month + 1;
        let y = period.year;
        if (m > 12) { m = 1; y++; }
        period = { ...period, year: y, month: m };
      }
    }
  }

  // When there are CON INTERESES plans, "PAGO MÍNIMO + MESES SIN INTERESES" is the
  // correct amount to avoid additional interest (covers both the installment plan
  // minimum and any SIN INTERESES monthly payments). Fall back to "PAGO PARA NO
  // GENERAR INTERESES" for statements that only have interest-free plans.
  const noInterestPayment = parseAmount(minMsiM?.[1]) ?? parseAmount(noIntM?.[1]);

  const summary = {
    totalBalance:      parseAmount(balanceM?.[1]),
    minimumPayment:    parseAmount(minM?.[1]),
    noInterestPayment,
  };

  const stYear  = period?.year  ?? new Date().getFullYear();
  const stMonth = period?.month ?? null;
  const transactions = [];

  // ── Payments: search full text for SU PAGO lines ──────────────────────────
  // Format: DD-MMM[garbled store text]SU PAGO SPEI[ref] -amount
  // The date and "SU PAGO" may be separated by unmapped-glyph garbage.
  const payRe = /(\d{1,2}-[A-Z]{3})[^\n]*?SU\s+PAGO[^\n]*?(-[\d,]+\.\d{2})/gi;
  let pm;
  while ((pm = payRe.exec(text)) !== null) {
    const date = parseDate(pm[1], stYear, stMonth) ?? `${stYear}-01-01`;
    transactions.push({
      date,
      description: 'PAGO SPEI',
      amount: parseAmount(pm[2]),
      type: 'payment',
    });
  }

  // ── RESUMEN CON INTERESES ─────────────────────────────────────────────────
  // Row format: DD-MMM[segment][plan][currentMonth?][saldoAnterior][cargos][pagoMinimo][saldoCorte]
  // All amounts concatenated.  Column mapping:
  //   • Fixed-term plans (e.g. "18 MENS LIVERCASH"):
  //       last-1 = Pago Mínimo  ← use this as msiMonthlyAmount
  //       last   = Saldo al Corte / Pago para no generar intereses
  //       currentMonth digit(s) are the prefix of amounts[0] (before the saldo anterior)
  //   • Non-term plans (e.g. PRESUPUESTO):
  //       last = Saldo al Corte (full current balance)  ← use as msiMonthlyAmount
  const conM = text.match(/MENSUALIDADES\s+CON\s+INTERESES([\s\S]*?)(?=MENSUALIDADES\s+SIN\s+INTERESES|RESUMEN\s+DE\s+PLANES\s+MENSUALIDADES\s+SIN|$)/i);
  if (conM) {
    for (const line of conM[1].split('\n')) {
      const l = line.trim();
      // Some PDFs have garbled body-text chars between the day digits and the dash
      // (e.g. "14Abreviación-AGO"). Allow up to 20 non-digit chars in between.
      const dayMonthM = l.match(/(\d{1,2})[^\n\d]{0,20}-([A-Z]{3})/i);
      if (!dayMonthM) continue;

      const amountMatches = [...l.matchAll(/([\d,]+\.\d{2})/g)];
      // Garbling may split "13,621.00" → "13" + garbled-chars + ",621.00".
      // When a match starts with "," (e.g. ",621.00"), the orphaned integer prefix
      // is the digits that appear immediately after the previous amount match.
      // e.g. "3,158.1013[garbled],621.00": between "3,158.10" and ",621.00" is
      // "13[garbled]" → leading digits "13" are the orphaned prefix → "13,621.00".
      const amounts = amountMatches.map((m, idx) => {
        let raw = m[1];
        if (raw.startsWith(',')) {
          let orphanStr = '';
          if (idx > 0) {
            // Digits immediately after the previous amount (before garbled chars)
            const prevEnd = amountMatches[idx - 1].index + amountMatches[idx - 1][0].length;
            const between = l.slice(prevEnd, m.index);
            const orphan = between.match(/^(\d{1,5})/);
            if (orphan) orphanStr = orphan[1];
          } else {
            // First amount: look back a short window
            const before = l.slice(0, m.index);
            const orphan = before.match(/(\d{1,5})\D{0,20}$/);
            if (orphan) orphanStr = orphan[1];
          }
          if (orphanStr) raw = orphanStr + raw;
        }
        return parseAmount(raw);
      });
      if (amounts.length < 1) continue;

      // Detect fixed-term plan: look for "NN MENS" in the line
      const termM = l.match(/(\d{1,2})\s+MENS/i);
      const msiTotalMonths = termM ? parseInt(termM[1]) : null;

      let msiCurrentMonth = null;
      let cargoMes;

      if (msiTotalMonths !== null && amounts.length >= 2) {
        // Fixed-term plan: Pago Mínimo = second-to-last amount
        cargoMes = amounts[amounts.length - 2];

        // Current month (Mensualidad a Pagar): digits concatenated with saldo anterior.
        // e.g. "LIVERCASH6162,162.21" → the "6" before "162," (a 3-digit thousands group)
        // is the current month. This works even when garbling splits the saldo number,
        // because the "6162," prefix is intact in the raw string.
        // Strategy: look in the text after "NN MENS" for the first digit(s) immediately
        // followed by a 3-digit thousands group (e.g. "6" before "162,").
        const afterMensMatch = l.match(/\d{1,2}\s+MENS/i);
        if (afterMensMatch) {
          const afterMens = l.slice(afterMensMatch.index + afterMensMatch[0].length);
          const monthM = afterMens.match(/(\d{1,2})(?=\d{3}[,.])/);
          if (monthM) {
            const m2 = parseInt(monthM[1]);
            if (m2 >= 1 && m2 <= msiTotalMonths) msiCurrentMonth = m2;
          }
        }
      } else {
        // Non-term plan (PRESUPUESTO): Saldo al Corte = last amount
        cargoMes = amounts[amounts.length - 1];
      }

      if (!cargoMes) continue;

      // Description: alphabetic text between date+store-digits and first amount.
      // Strip plan keywords and unmapped glyphs (body-text font chars like ¢, £, ¤).
      const descM = l.match(/\d{1,2}-[A-Z]{3}\d*\s*([A-Z][^]*?)[\d,]+\.\d{2}/i);
      const rawDesc = descM
        ? descM[1]
            .replace(/\s*(PRESUPUESTO|LIVERCASH|CREDITO|\d+\s*MENS).*$/i, '')
            .replace(/[^\x20-\x7E]/g, '')
            .trim()
            .replace(/\s+/g, ' ')
        : '';
      // Require at least 4 non-space chars to be a meaningful description
      const description = rawDesc.replace(/\s/g, '').length >= 4 ? rawDesc : '';

      const conDate = parseDate(`${dayMonthM[1]}-${dayMonthM[2]}`, stYear, stMonth) ?? `${stYear}-01-01`;
      const isPresupuesto = msiTotalMonths === null;
      if (isPresupuesto) {
        // PRESUPUESTO in RESUMEN CON INTERESES is the revolving credit line balance summary.
        // Individual charges are already captured from DETALLE DE MOVIMIENTOS — skip to avoid duplicates.
        continue;
      }
      transactions.push({
        date: conDate,
        description: description || 'MSI CON INTERESES',
        amount: cargoMes,
        type: 'msi',
        msiMonthlyAmount: cargoMes,
        msiTotalMonths,
        msiCurrentMonth,
      });
    }
  }

  // ── RESUMEN SIN INTERESES ─────────────────────────────────────────────────
  // Runs on full text because the PDF extractor interleaves DETALLE and RESUMEN
  // lines when they share page-coordinate ranges.
  // RESUMEN rows have 4+ amounts (saldo_anterior, cargos, mensualidad, saldo_al_corte).
  // DETALLE rows have exactly 1 positive amount (original purchase) → skip those.
  // Some PDFs use "MESES" instead of "MENS", and "INTERSES" instead of "INTERESES"
  // Two patterns via alternation:
  //   sm[1]: normal case — digit immediately before "MENS" (e.g. "09 MENS SIN INTERESES")
  //   sm[2]: absorbed-digit case — digit is last 2 chars of segment number, separated from
  //          "MENS" by ≥10 chars of garbled footnote text injected by the PDF extractor
  //          (e.g. "08809[Glosario de abreviaturas…]MENS SIN INTERESES")
  //          Normal cases have exactly 1 space, so the {10,300} minimum excludes them.
  //          (?!\d) prevents matching mid-sequence in phone/folio numbers (e.g. "20260→3…").
  //          [^\n\d]{10,300}? prevents crossing digit runs (phone numbers, folio numbers).
  //          The legitimate garbled-footnote gap contains no digits.
  // "SIN" may be split by garbled "Descripción" text: allow S[garbled]IN via S[^\n]{0,80}?IN
  const sinRe = /(?:(\d{1,2})\s+|\d{3}(\d{1,2})(?!\d)[^\n\d]{10,300}?)(?:MENS|MESES)\s+S[^\n]{0,80}?IN\s+INTERE?SES/gi;
  let sm;
  while ((sm = sinRe.exec(text)) !== null) {
    const totalMonths = parseInt(sm[1] ?? sm[2]);
    if (totalMonths < 1 || totalMonths > 60) continue;

    // Grab context window around the match to find date and amounts
    const start = Math.max(0, sm.index - 60);
    const end   = Math.min(text.length, sm.index + sm[0].length + 200);
    const ctx   = text.slice(start, end);

    // Quick non-empty check: skip if no amounts at all in the context
    if (!/([\d,]+\.\d{2})/.test(ctx)) continue;

    // Column order: Mensualidad | Saldo Anterior | Cargos del Periodo | Pago para no generar intereses | Saldo al Corte
    //
    // Two possible layouts depending on the PDF:
    //
    // SINGLE-LINE layout (Karla-style): all amounts on the same line as the plan name.
    //   "09 MENS SIN INTERESES8255.360.00476.371,905.51"
    //   afterAmounts: [8255.36(inflated), 0.00, 476.37, 1905.51]
    //   → Pago para no generar intereses = afterAmounts[2]
    //   → current month: prefix digits of afterAmounts[0] string
    //
    // SPLIT-LINE layout (Alan-style): Saldo al Corte appears on the plan-name line;
    //   date + other amounts appear on a separate line below.
    //   Line 1: "03 MENS SIN INTERESES726.80"          ← Saldo al Corte
    //   Line 2: "7-MAR10.00726.80242.26"               ← date + currentMonth(1)+saldo(0.00) + cargos + pago
    //   afterAmounts: [726.80, 10.00(inflated), 726.80, 242.26, ...]
    //   → Pago para no generar intereses = afterAmounts[3]
    //   → current month: prefix digits of afterAmounts[1] string (after the saldo-al-corte)
    // Anchor afterKey to the EXACT match position in ctx, not the first occurrence
    // of 'MENS SIN INTERESES' in ctx (which could be from a previous line when the
    // 60-char lookback window overlaps the preceding RESUMEN entry).
    const keyIdx = sm.index - start;
    const afterKey = ctx.slice(keyIdx);

    // Detect split-line layout: amount immediately after "INTERESES" then newline + date
    const isSplitLayout = /MENS\s+SIN\s+INTERESES[\d,]+\.\d{2}\s*\n\d{1,2}-[A-Z]{3}/i.test(afterKey);

    // Restrict amount extraction to relevant lines only — prevents amounts from
    // adjacent lines (SU PAGO, Sub Total, etc.) contaminating the context.
    // Single layout: only the plan-name line (up to first \n).
    // Split layout: plan-name line + the date line below it (up to second \n).
    const afterKeyLines = afterKey.split('\n');
    const relevantAfterKey = isSplitLayout
      ? afterKeyLines.slice(0, 2).join('\n')
      : afterKeyLines[0];

    const afterAmountMatches = [...relevantAfterKey.matchAll(/([\d,]+\.\d{2})/g)];
    const afterAmounts = afterAmountMatches.map(m => parseAmount(m[1]));

    // Skip DETALLE purchase lines: only 1 positive amount (the purchase total).
    // RESUMEN rows have at least 3 (saldo_anterior, mensualidad, saldo_al_corte).
    // Skip DETALLE purchase lines: only 1 positive amount (the purchase total).
    // RESUMEN rows have at least 3 (saldo_anterior, mensualidad, saldo_al_corte).
    if (afterAmounts.filter(a => a > 0).length < 3) continue;

    // Extract current month (Mensualidad a Pagar column).
    let msiCurrentMonth = null;
    if (isSplitLayout) {
      // Split layout: month digit(s) are concatenated with saldo anterior on the date line,
      // producing an "inflated" amount at afterAmountMatches[1] (after Saldo al Corte at [0]).
      // e.g. "7-MAR10.00726.80242.26" → "10.00" = month 1 + saldo 0.00
      const inflatedStr = afterAmountMatches[1]?.[1] ?? '';
      const prefixM2 = inflatedStr.match(/^(\d{1,2})/);
      if (prefixM2) {
        const twoD = parseInt(prefixM2[1]);
        if (twoD >= 1 && twoD <= totalMonths) {
          msiCurrentMonth = twoD;
        } else if (prefixM2[1].length === 2) {
          const oneD = Math.floor(twoD / 10);
          if (oneD >= 1 && oneD <= totalMonths) msiCurrentMonth = oneD;
        }
      }
    } else {
      // Single layout: month digit(s) appear immediately after "MENS SIN INTERESES",
      // before any garbled text (VTA, USD, PIF…) or the saldo anterior digits.
      // e.g. "INTERESES2VTA629.00" → captures "2"; "INTERESES8255.36" → captures "82"
      const directM = afterKey.match(/MENS\s+S[^\n]{0,80}?IN\s+INTERE?SES\s*(\d{1,2})/i);
      if (directM) {
        const twoD = parseInt(directM[1]);
        if (twoD >= 1 && twoD <= totalMonths) {
          msiCurrentMonth = twoD;
        } else if (directM[1].length === 2) {
          const oneD = Math.floor(twoD / 10);
          if (oneD >= 1 && oneD <= totalMonths) msiCurrentMonth = oneD;
        }
      }
    }

    // Date: prefer the DD-MMM found in the ~20 chars immediately before the match
    // (same line as the plan entry) to avoid picking up a date from the previous line
    // when the 60-char lookback window overlaps it.
    const nearPrefix = ctx.slice(Math.max(0, keyIdx - 20), keyIdx);
    const dateM = nearPrefix.match(/(\d{1,2}-[A-Z]{3})/i) || ctx.match(/(\d{1,2}-[A-Z]{3})/i);
    if (!dateM) continue;

    // Select Pago para no generar intereses and Saldo al Corte by layout.
    // Single layout: [..., cargos, mensualidad, saldo_al_corte]  → pagoIdx=2, saldo=last
    // Split layout:  [saldo_al_corte, inflated, saldo_al_corte, mensualidad] → pagoIdx=3, saldo=first
    const pagoIdx = isSplitLayout ? 3 : 2;
    const cargoMes = afterAmounts[pagoIdx] ?? afterAmounts[2] ?? afterAmounts[1] ?? afterAmounts[0];
    if (!cargoMes) continue;

    // Saldo al Corte = outstanding balance including current month's installment.
    // Used for accurate remaining_months = ceil(saldo / monthly).
    const saldoAlCorte = isSplitLayout
      ? afterAmounts[0]                            // appears on the plan-name line
      : afterAmounts[afterAmounts.length - 1];     // last amount in single-line layout

    transactions.push({
      date: parseDate(dateM[1], stYear, stMonth) ?? `${stYear}-01-01`,
      description: `${totalMonths} MESES SIN INTERESES`,
      amount: cargoMes,
      type: 'msi',
      msiMonthlyAmount: cargoMes,
      msiTotalMonths: totalMonths,
      msiCurrentMonth,
      msiRemainingAmount: (saldoAlCorte != null && saldoAlCorte > 0) ? saldoAlCorte : null,
    });
  }

  // ── DETALLE DE MOVIMIENTOS: regular charges and IVA ──────────────────────
  // Column layout (space-separated within same Y group):
  //   DD-MMM [3-digit segment] [Description] [Plan] [RFC] [Compras y Cargos] [Moneda Ext.] [Pagos]
  //
  // PDF fine-print text often shares the same Y-coordinate as a transaction row,
  // so the date may NOT be at the start of the extracted line — find it by position.
  //
  // Classification:
  //   PRESUPUESTO plan  → type='charge'  (regular one-time purchase on main credit line)
  //   IVA SOBRE *       → type='interest' (tax on interest / fees)
  //   everything else   → skip (MSI purchases handled by RESUMEN parsers, payments by payRe)
  const detalleSection = text.match(/DETALLE\s+DE\s+MOVIMIENTOS[\s\S]*?(?=RESUMEN\s+DE\s+PLANES|$)/i);
  if (detalleSection) {
    for (const rawLine of detalleSection[0].split('\n')) {
      const l = rawLine.trim();
      if (!l) continue;

      // Date may be preceded by garbled fine-print on the same PDF Y-coordinate.
      // Find the first occurrence of DD-MMM and work with the substring from there.
      const dateHit = /\d{1,2}-[A-Z]{3}/i.exec(l);
      if (!dateHit) continue;
      const fromDate = l.slice(dateHit.index);

      if (/SU\s+PAGO/i.test(fromDate)) continue;   // handled by payRe

      // Check for devolución (refund): negative amount in Pagos y Abonos column.
      // These appear as returns on MSI plans and are not SU PAGO lines.
      const negAmountM = fromDate.match(/(-[\d,]+\.\d{2})/);
      if (negAmountM) {
        const amount = parseAmount(negAmountM[1]);
        if (!amount || amount >= 0) continue;
        const descRaw = fromDate.match(/^\d{1,2}-[A-Z]{3}\s*\d{0,3}\s*([A-Z].*?)\s*(?=-[\d,]+\.\d{2})/i);
        if (!descRaw) continue;
        const description = descRaw[1]
          .replace(/\s*(PRESUPUESTO|LIVERCASH|CREDITO|\d+\s*MENS).*$/i, '')
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[^A-Z0-9]+$/i, '');
        if (!description) continue;
        transactions.push({
          date: parseDate(dateHit[0], stYear, stMonth) ?? `${stYear}-01-01`,
          description,
          amount,
          type: 'payment',
        });
        continue;
      }

      // Determine transaction type for positive-amount lines
      let txType;
      if (/PRESUPUESTO/i.test(fromDate)) {
        txType = 'charge';
      } else if (/IVA\s+SOBRE/i.test(fromDate)) {
        txType = 'interest';
      } else if (/INTERESES\s+FINANCIEROS/i.test(fromDate)) {
        txType = 'charge';
      } else if (/\d{1,2}\s*MENS/i.test(fromDate)) {
        txType = 'msi_purchase';  // original purchase put on MSI (cur=0, not a monthly charge)
      } else {
        continue;
      }

      // First positive non-zero amount on the line = Compras y Cargos column.
      // Some PRESUPUESTO lines have "0.00" before the actual amount
      // (e.g. "PRESUPUESTO0.00998.00") — skip zero amounts.
      const allLineAmounts = [...fromDate.matchAll(/([\d,]+\.\d{2})/g)].map(m => parseAmount(m[1]));
      const amount = allLineAmounts.find(a => a > 0);
      if (!amount) continue;

      // Description: text between date+optional-segment-code and the first amount.
      // Strip trailing plan keyword since it is not the purchase name.
      const descRaw = fromDate.match(/^\d{1,2}-[A-Z]{3}\s*\d{0,3}\s*([A-Z].*?)\s*(?=[\d,]+\.\d{2})/i);
      if (!descRaw) continue;
      const description = descRaw[1]
        .replace(/\s*(PRESUPUESTO|LIVERCASH|CREDITO|\d+\s*MENS).*$/i, '') // strip plan column and everything after
        .replace(/[^\x20-\x7E]/g, '')  // remove unmapped glyphs (non-ASCII leftovers)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z0-9 ]+$/i, ''); // strip trailing non-word chars
      if (!description) continue;

      if (txType === 'msi_purchase') {
        const termM = fromDate.match(/(\d{1,2})\s*MENS/i);
        const msiTotalMonths = termM ? parseInt(termM[1]) : null;
        transactions.push({
          date: parseDate(dateHit[0], stYear, stMonth) ?? `${stYear}-01-01`,
          description,
          amount,
          type: 'msi',
          msiMonthlyAmount: null,
          msiTotalMonths,
          msiCurrentMonth: 0,  // 0 = original purchase, not a monthly installment
        });
      } else {
        transactions.push({
          date: parseDate(dateHit[0], stYear, stMonth) ?? `${stYear}-01-01`,
          description,
          amount,
          type: txType,
        });
      }
    }
  }

  return { period, summary, transactions };
}
