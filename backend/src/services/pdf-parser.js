import { createRequire } from 'module';
import { parseBBVA } from './parsers/bbva.js';
import { parseBanamex } from './parsers/banamex.js';
import { parseSantander } from './parsers/santander.js';

// pdf-parse doesn't forward passwords to pdfjs, so we use the bundled pdfjs directly.
const require = createRequire(import.meta.url);
const PDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
PDFJS.disableWorker = true;

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

const BANK_DETECTORS = [
  { bank: 'bbva',      keywords: ['BBVA', 'Bancomer'] },
  { bank: 'banamex',   keywords: ['Citibanamex', 'Banamex', 'Citi '] },
  { bank: 'santander', keywords: ['Santander'] },
];

const PARSERS = {
  bbva:      parseBBVA,
  banamex:   parseBanamex,
  santander: parseSantander,
};

function detectBank(text) {
  const sample = text.slice(0, 1000).toLowerCase();
  for (const { bank, keywords } of BANK_DETECTORS) {
    if (keywords.some(kw => sample.includes(kw.toLowerCase()))) return bank;
  }
  return 'unknown';
}

export async function parsePDF(buffer, { password } = {}) {
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
