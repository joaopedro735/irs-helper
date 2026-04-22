import type { TaxRow8A, ParsedPdfData } from '../../types';
import { resolveCountryCode } from '../brokerCountries';
import { BrokerParsingError } from '../parserErrors';
import { extractPdfText, matchesAnyMarker } from './common';

// ---------------------------------------------------------------------------
// Content fingerprints
// ---------------------------------------------------------------------------

const T212_REPORT_MARKERS = [
  /Trading\s*212/i,
  /Annual\s*Statement/i,
  /Trading\s*212\s*Markets/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeT212Number(value: string): string {
  return value.replace(/,/g, '');
}

function extractOverviewAmount(fullText: string, label: RegExp): number {
  const match = fullText.match(new RegExp(label.source + '\\s+€([\\d,]+(?:\\.\\d+)?)', label.flags));
  if (!match) return 0;
  return parseFloat(normalizeT212Number(match[1])) || 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseTrading212Pdf(file: File): Promise<ParsedPdfData> {
  const pageTexts = await extractPdfText(file);
  const fullText = pageTexts.join(' ');

  const looksLikeT212 = matchesAnyMarker(fullText, T212_REPORT_MARKERS);

  if (!looksLikeT212) {
    throw new BrokerParsingError(
      `"${file.name}" does not appear to be a Trading 212 Annual Statement. Please upload the correct file.`,
      'parser.error.t212_wrong_file',
      { fileName: file.name }
    );
  }

  const rows8A: TaxRow8A[] = [];

  // --- Interest on cash + Share lending interest (E21, Cyprus 196) ---
  const interestOnCash = extractOverviewAmount(fullText, /Interest\s+on\s+cash/i);
  const shareLendingInterest = extractOverviewAmount(fullText, /Share\s+lending\s+interest/i);
  const totalInterest = interestOnCash + shareLendingInterest;

  if (totalInterest > 0) {
    rows8A.push({
      codigo: 'E21',
      codPais: '196',
      rendimentoBruto: totalInterest.toFixed(2),
      impostoPago: '0.00',
    });
  }

  // --- Dividends by country (E11, per country) ---
  const divSectionMatch = fullText.match(
    /NET\s+AMOUNT\s+\(EUR\)\s+(.*?)Dividends\s+by\s+instrument/s
  );

  if (divSectionMatch) {
    const divText = divSectionMatch[1];
    const divRowRegex = /((?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+)*)\s+([\d,.]+)\s+(?:[\d.]+%|-)\s+([\d,.]+|-)\s+[\d,.]+/g;
    let match: RegExpExecArray | null;

    while ((match = divRowRegex.exec(divText)) !== null) {
      const countryName = match[1];
      const grossAmount = normalizeT212Number(match[2]);
      const wht = match[3] === '-' ? '0.00' : normalizeT212Number(match[3]);
      const countryCode = resolveCountryCode(countryName);

      if (countryCode) {
        rows8A.push({
          codigo: 'E11',
          codPais: countryCode,
          rendimentoBruto: grossAmount,
          impostoPago: wht,
        });
      }
    }
  }

  if (rows8A.length === 0) {
    throw new BrokerParsingError(
      `No dividend/interest data found in "${file.name}". Please verify this is a Trading 212 Annual Statement.`,
      'parser.error.t212_no_rows',
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
