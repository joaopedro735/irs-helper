import type { TaxRowG9, ParsedPdfData } from '../../types';
import { BrokerParsingError } from '../parserErrors';
import { normalizeNumber, extractPdfText, matchesAnyMarker } from './common';

// ---------------------------------------------------------------------------
// Content fingerprints
// ---------------------------------------------------------------------------

const ACTIVOBANK_MARKERS = [
  /ActivoBank/i,
  /activobank\.pt/i,
  /Aliena[çc][ãa]o\s*[Oo]nerosa\s*de\s*Valores\s*Mobili[áa]rios/i,
];

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ACTIVOBANK_NIF = '500734305';

const REGEX_ACTIVOBANK = /(.+?)\s+(\d{3})\s+(\d+)\s+(\d{4}\/\d{2}\/\d{2})\s+([\d.,]+)\s+(\d{4}\/\d{2}\/\d{2})\s+([\d.,]+)\s+([\d.,]+)/g;

function parseActivoBankDate(dateStr: string): { year: string; month: string; day: string } {
  const [year, month, day] = dateStr.split('/');
  return {
    year,
    month: String(parseInt(month, 10)),
    day: String(parseInt(day, 10)),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseActivoBankPdf(file: File): Promise<ParsedPdfData> {
  const pageTexts = await extractPdfText(file);
  const fullText = pageTexts.join(' ');

  const looksLikeActivoBank = matchesAnyMarker(fullText, ACTIVOBANK_MARKERS);

  if (!looksLikeActivoBank) {
    throw new BrokerParsingError(
      `"${file.name}" does not appear to be an ActivoBank statement. Please upload the correct file.`,
      'parser.error.activobank_wrong_file',
      { fileName: file.name }
    );
  }

  const rowsG9: TaxRowG9[] = [];

  for (const text of pageTexts) {
    const regex = new RegExp(REGEX_ACTIVOBANK.source, REGEX_ACTIVOBANK.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const countryCode = match[2];
      const saleDate = parseActivoBankDate(match[4]);
      const purchaseDate = parseActivoBankDate(match[6]);

      rowsG9.push({
        titular: 'A',
        nif: ACTIVOBANK_NIF,
        codEncargos: 'G01',
        anoRealizacao: saleDate.year,
        mesRealizacao: saleDate.month,
        diaRealizacao: saleDate.day,
        valorRealizacao: normalizeNumber(match[5]),
        anoAquisicao: purchaseDate.year,
        mesAquisicao: purchaseDate.month,
        diaAquisicao: purchaseDate.day,
        valorAquisicao: normalizeNumber(match[7]),
        despesasEncargos: normalizeNumber(match[8]),
        paisContraparte: countryCode,
      });
    }
  }

  if (rowsG9.length === 0) {
    throw new BrokerParsingError(
      `No stock transaction rows found in "${file.name}". Please verify this is an ActivoBank capital gains statement.`,
      'parser.error.activobank_no_rows',
      { fileName: file.name }
    );
  }

  return {
    rows8A: [],
    rows92A: [],
    rows92B: [],
    rowsG9,
    rowsG13: [],
    rowsG18A: [],
    rowsG1q7: [],
    warnings: [],
  };
}
