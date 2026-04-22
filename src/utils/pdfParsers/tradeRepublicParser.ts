import type { TaxRow8A, ParsedPdfData } from '../../types';
import { BrokerParsingError } from '../parserErrors';
import { normalizeNumber, extractPdfText, extractRows, matchesAnyMarker } from './common';

// ---------------------------------------------------------------------------
// Regex patterns (shared with XTB for TR's IRS-formatted layout)
// ---------------------------------------------------------------------------

const REGEX_8A = /(?:^|\s)\d{3}\s+(E\d{2})\s*(?:\(\d+%?\))?\s+(\d{3})\s+([\d.,-]+)\s+([\d.,-]+)(?=\s|$)/g;

// ---------------------------------------------------------------------------
// Content fingerprints
// ---------------------------------------------------------------------------

const TR_REPORT_MARKERS = [
  /Trade\s*Republic/i,
  /Steuerübersicht/i,
  /Tax\s*Report/i,
  /Relatório\s*(?:de\s*)?Impost/i,
];

// ---------------------------------------------------------------------------
// Row extractors
// ---------------------------------------------------------------------------

function extractRows8A(pageTexts: string[]): TaxRow8A[] {
  return extractRows(pageTexts, REGEX_8A, match => ({
    codigo: match[1],
    codPais: match[2],
    rendimentoBruto: normalizeNumber(match[3]),
    impostoPago: normalizeNumber(match[4]),
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseTradeRepublicPdf(file: File): Promise<ParsedPdfData> {
  const pageTexts = await extractPdfText(file);
  const fullText = pageTexts.join(' ');

  const looksLikeTR = matchesAnyMarker(fullText, TR_REPORT_MARKERS);

  if (!looksLikeTR) {
    throw new BrokerParsingError(
      `"${file.name}" does not appear to be a Trade Republic Tax Report. Please upload the correct file.`,
      'parser.error.tr_wrong_file',
      { fileName: file.name }
    );
  }

  const rows8A = extractRows8A(pageTexts);

  if (rows8A.length === 0) {
    throw new BrokerParsingError(
      `No dividend/interest rows found in "${file.name}". Please verify this is a Trade Republic Tax Report with Quadro 8A data.`,
      'parser.error.tr_no_rows',
      { fileName: file.name }
    );
  }

  return {
    rows8A,
    rows92A: [],
    rows92B: [],
    rowsG9: [],
    rowsG13: [],
    rowsG18A: [],
    rowsG1q7: [],
    warnings: [],
  };
}
