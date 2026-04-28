import { createRequire } from 'module';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseBBVA } from './parsers/bbva.js';
import { parseBanamex } from './parsers/banamex.js';
import { parseSantander } from './parsers/santander.js';
import { parseAmex } from './parsers/amex.js';
import { decodeLiverpool, parseLiverpool } from './parsers/liverpool.js';

// pdf-parse doesn't forward passwords to pdfjs, so we use the bundled pdfjs directly.
const require = createRequire(import.meta.url);
const PDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
PDFJS.disableWorker = true;

const execFileAsync = promisify(execFile);

async function extractText(buffer, password) {
  const docOptions = { data: buffer };
  if (password) docOptions.password = password;

  const doc = await PDFJS.getDocument(docOptions);
  let text = '';

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    let lastY, pageText = '';
    for (const item of content.items) {
      if (lastY === item.transform[5] || !lastY) {
        pageText += item.str;
      } else {
        pageText += '\n' + item.str;
      }
      lastY = item.transform[5];
    }
    text += '\n\n' + pageText;
  }

  doc.destroy();
  return text;
}

// Liverpool PDFs use a custom font encoding with no ToUnicode CMap.
// Every PDF library (PyMuPDF, pdfjs, pdfminer) replaces all glyphs with U+FFFD.
// We parse the raw PDF content streams directly to extract the byte-level character
// codes, then apply our hand-built decode table (decodeLiverpool).
export const LIVERPOOL_EXTRACT_SCRIPT = `
import sys, re, zlib

with open(sys.argv[1], 'rb') as f:
    data = f.read()

streams = []
for m in re.finditer(rb'stream[\\r\\n]+(.*?)[\\r\\n]+endstream', data, re.DOTALL):
    raw = m.group(1)
    try:
        s = zlib.decompress(raw)
    except Exception:
        s = raw
    streams.append(s)

def parse_string(s, i):
    assert s[i:i+1] == b'('
    i += 1
    result = bytearray()
    depth = 1
    while i < len(s) and depth > 0:
        c = s[i:i+1]
        if c == b'\\\\':
            i += 1
            esc = s[i:i+1]
            escmap = {b'n':b'\\n',b'r':b'\\r',b't':b'\\t',b'b':b'\\b',b'f':b'\\f',
                      b'(':b'(',b')':b')',b'\\\\\\\\':b'\\\\\\\\'}
            if esc in escmap:
                result.extend(escmap[esc])
            elif esc in b'01234567':
                oct_str = esc
                for _ in range(2):
                    i += 1
                    if i < len(s) and s[i:i+1] in b'01234567':
                        oct_str += s[i:i+1]
                    else:
                        i -= 1
                        break
                result.append(int(oct_str, 8))
            else:
                result.extend(esc)
        elif c == b'(':
            depth += 1
            result.extend(c)
        elif c == b')':
            depth -= 1
            if depth > 0:
                result.extend(c)
        else:
            result.extend(c)
        i += 1
    return bytes(result), i

def extract_text_from_stream(s):
    items = []
    i = 0
    in_bt = False
    tx, ty = 0.0, 0.0
    lm_x, lm_y = 0.0, 0.0
    stack = []

    while i < len(s):
        while i < len(s) and s[i:i+1] in (b' ', b'\\t', b'\\r', b'\\n'):
            i += 1
        if i >= len(s):
            break

        matched = False
        for op, length in [(b'BT',2),(b'ET',2),(b'Td',2),(b'TD',2),(b'Tm',2),(b'T*',2),(b'Tj',2),(b'TJ',2),(b'Tf',2)]:
            if s[i:i+length] == op and (i+length >= len(s) or s[i+length:i+length+1] in b' \\t\\r\\n/(['):
                if op == b'BT':
                    in_bt = True; tx,ty = 0.0,0.0; lm_x,lm_y = 0.0,0.0
                elif op == b'ET':
                    in_bt = False; stack.clear()
                elif op == b'Td' and len(stack) >= 2:
                    lm_x += float(stack[-2]); lm_y += float(stack[-1])
                    tx,ty = lm_x,lm_y; stack.clear()
                elif op == b'TD' and len(stack) >= 2:
                    lm_x += float(stack[-2]); lm_y += float(stack[-1])
                    tx,ty = lm_x,lm_y; stack.clear()
                elif op == b'Tm' and len(stack) >= 6:
                    lm_x,lm_y = float(stack[-2]),float(stack[-1])
                    tx,ty = lm_x,lm_y; stack.clear()
                elif op == b'T*':
                    lm_y -= 1000; ty = lm_y
                elif op == b'Tj' and in_bt and stack:
                    raw = stack.pop()
                    if isinstance(raw, bytes):
                        items.append((tx, ty, raw))
                        tx += len(raw) * 20
                    stack.clear()
                i += length; matched = True; break

        if matched:
            continue

        c = s[i:i+1]
        if c == b'(':
            raw, i = parse_string(s, i)
            stack.append(raw)
        elif c == b'[':
            i += 1
            arr_bytes = bytearray()
            while i < len(s) and s[i:i+1] != b']':
                if s[i:i+1] == b'(':
                    rb, i = parse_string(s, i)
                    arr_bytes.extend(rb)
                elif s[i:i+1] in b' \\t\\r\\n-+0123456789.':
                    while i < len(s) and s[i:i+1] in b' \\t\\r\\n-+0123456789.':
                        i += 1
                else:
                    i += 1
            if i < len(s): i += 1
            j = i
            while j < len(s) and s[j:j+1] in b' \\t\\r\\n': j += 1
            if s[j:j+2] == b'TJ':
                if in_bt: items.append((tx, ty, bytes(arr_bytes))); tx += len(arr_bytes)*20
                i = j + 2
            else:
                stack.append(bytes(arr_bytes))
        elif c == b'/':
            j = i + 1
            while j < len(s) and s[j:j+1] not in b' \\t\\r\\n/()[]{}<>': j += 1
            stack.append(s[i:j]); i = j
        elif c in b'-+.0123456789':
            j = i
            while j < len(s) and s[j:j+1] in b'-+.0123456789': j += 1
            try: stack.append(s[i:j].decode())
            except: stack.append('0')
            i = j
        else:
            j = i + 1
            while j < len(s) and s[j:j+1] not in b' \\t\\r\\n': j += 1
            i = j

    return items

all_items = []
for s in streams:
    if b'BT' in s and b'ET' in s and (b'Tj' in s or b'TJ' in s):
        all_items.extend(extract_text_from_stream(s))

all_items.sort(key=lambda x: (-x[1], x[0]))

lines = []
cur_y = None
cur_line = []
for x, y, raw in all_items:
    if cur_y is None or abs(y - cur_y) > 15:
        if cur_line: lines.append(cur_line)
        cur_line = [(x, raw)]; cur_y = y
    else:
        cur_line.append((x, raw))
if cur_line: lines.append(cur_line)

for line in lines:
    line.sort(key=lambda t: t[0])
    combined = b''.join(r for _, r in line)
    sys.stdout.buffer.write(combined + b'\\n')
`;

async function extractTextLiverpool(buffer) {
  const tmpPath = join(tmpdir(), `liverpool_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    await writeFile(tmpPath, buffer);
    const { stdout } = await execFileAsync('python3', ['-c', LIVERPOOL_EXTRACT_SCRIPT, tmpPath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'buffer',
    });
    // stdout contains raw Latin-1 bytes matching our decode table
    return stdout.toString('latin1');
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

// Liverpool header fallback via PyMuPDF.
// Our custom stream extractor misses header values (balance, payments, due date) when
// they live in a Form XObject — PyMuPDF applies the invocation's coordinate transform
// so the items sort to the correct page position. We only need page 1.
// PyMuPDF outputs UTF-8; decodeLiverpool works on it because its key chars are Latin-1
// ≡ Unicode U+00xx, which JS string comparison handles correctly.
const LIVERPOOL_PYMUPDF_SCRIPT = `
import sys, fitz
doc = fitz.open(sys.argv[1])
if doc.page_count > 0:
    sys.stdout.buffer.write(doc[0].get_text("text", sort=True).encode("utf-8"))
doc.close()
`;

async function extractLiverpoolPageOne(buffer) {
  const tmpPath = join(tmpdir(), `liverpool_p1_${Date.now()}.pdf`);
  try {
    await writeFile(tmpPath, buffer);
    const { stdout } = await execFileAsync('python3', ['-c', LIVERPOOL_PYMUPDF_SCRIPT, tmpPath], {
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'buffer',
    });
    return stdout.toString('utf8');
  } catch { return ''; }
  finally { await unlink(tmpPath).catch(() => {}); }
}

// Check PDF metadata for the Liverpool-specific generator string.
async function getLiverpoolCreator(buffer) {
  try {
    const doc = await PDFJS.getDocument({ data: buffer });
    const meta = await doc.getMetadata();
    doc.destroy();
    return meta?.info?.Creator || '';
  } catch {
    return '';
  }
}

const BANK_DETECTORS = [
  { bank: 'bbva',      keywords: ['BBVA', 'Bancomer'] },
  { bank: 'banamex',   keywords: ['Citibanamex', 'Banamex', 'Citi '] },
  { bank: 'santander', keywords: ['Santander'] },
  { bank: 'amex',      keywords: ['American Express', 'americanexpress'] },
];

const PARSERS = {
  bbva:      parseBBVA,
  banamex:   parseBanamex,
  santander: parseSantander,
  amex:      parseAmex,
};

function detectBank(text) {
  const sample = text.slice(0, 1000).toLowerCase();
  for (const { bank, keywords } of BANK_DETECTORS) {
    if (keywords.some(kw => sample.includes(kw.toLowerCase()))) return bank;
  }
  return 'unknown';
}

export async function parsePDF(buffer, { password } = {}) {
  // Liverpool detection: check PDF Creator metadata before extracting text,
  // because the font encoding makes all text U+FFFD through normal extractors.
  const creator = await getLiverpoolCreator(buffer);
  if (creator.includes('CONTROL-D')) {
    const rawLatin1 = await extractTextLiverpool(buffer);
    const decoded = decodeLiverpool(rawLatin1);
    const result = parseLiverpool(decoded);

    // When the custom stream extractor misses header values (they live in a Form XObject
    // that our script places at wrong coordinates), fill in the gaps via PyMuPDF page 1.
    const needsHeaderFallback =
      !result.summary?.totalBalance ||
      !result.summary?.minimumPayment ||
      !result.period?.dueDate;
    if (needsHeaderFallback) {
      try {
        const p1Raw  = await extractLiverpoolPageOne(buffer);
        const p1Text = decodeLiverpool(p1Raw);
        const p1     = parseLiverpool(p1Text);
        if (!result.summary) result.summary = {};
        if (!result.summary.totalBalance      && p1.summary?.totalBalance)
          result.summary.totalBalance = p1.summary.totalBalance;
        if (!result.summary.minimumPayment    && p1.summary?.minimumPayment)
          result.summary.minimumPayment = p1.summary.minimumPayment;
        if (!result.summary.noInterestPayment && p1.summary?.noInterestPayment)
          result.summary.noInterestPayment = p1.summary.noInterestPayment;
        if (result.period && !result.period.dueDate && p1.period?.dueDate)
          result.period = { ...result.period, dueDate: p1.period.dueDate };
      } catch { /* fallback failure is non-fatal */ }
    }

    // Backup period fix — runs regardless of whether the fallback was needed.
    // The folio-line heuristic in parseLiverpool may not fire for every PDF variant.
    // Once we have a dueDate (from text or from the fallback above), use it as a
    // secondary signal: if the cutoff falls in the last 8 days of its month AND the
    // due date is in the immediately following month AND the period is still pointing
    // at the cutoff month (folio heuristic didn't advance it), advance to the due month.
    //
    // Safe for mid-month cutoffs (e.g. Karla, cutoff day 11): 11 >= (31-8)=23 → false.
    // Works for late-month cutoffs (e.g. Alan, cutoff day 28): 28 >= 23 → true.
    if (result.period?.cutoffDate && result.period?.dueDate) {
      const [cy, cm, cd] = result.period.cutoffDate.split('-').map(Number);
      const [dy, dm]     = result.period.dueDate.split('-').map(Number);
      const lastDay      = new Date(cy, cm, 0).getDate(); // last day of cutoff month
      const isLastWeek   = cd >= lastDay - 8;
      const isNextMonth  = (dy === cy && dm === cm + 1) ||
                           (dm === 1 && cm === 12 && dy === cy + 1);
      const stillAtCutoff = result.period.year === cy && result.period.month === cm;
      if (isLastWeek && isNextMonth && stillAtCutoff) {
        result.period = { ...result.period, year: dy, month: dm };
      }
    }

    return { bank: 'liverpool', raw_text: decoded, ...result };
  }

  const text = await extractText(buffer, password);
  const bank = detectBank(text);

  const parser = PARSERS[bank];
  if (!parser) {
    return {
      bank: 'unknown',
      raw_text: text,
      period: null,
      summary: null,
      transactions: [],
      error: `Bank not recognized. Detected text sample: ${text.slice(0, 200)}`,
    };
  }

  const result = parser(text);
  return { bank, raw_text: text, ...result };
}
