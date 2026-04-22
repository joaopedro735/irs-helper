import { describe, it, expect, vi } from 'vitest';
import { parseActivoBankPdf } from './activoBankParser';
import { BrokerParsingError } from '../parserErrors';
import { mockPdfDocument } from './testHelper';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

const AB_HEADER = 'ActivoBank Alienação Onerosa de Valores Mobiliários ';

function abPage(body: string): { str: string }[] {
  return [{ str: AB_HEADER + body }];
}

describe('parseActivoBankPdf', () => {
  it('throws when file does not match ActivoBank markers', async () => {
    mockPdfDocument([{ str: 'Completely unrelated document' }]);
    const file = new File([''], 'other.pdf');
    await expect(parseActivoBankPdf(file)).rejects.toThrow(BrokerParsingError);
    await expect(parseActivoBankPdf(file)).rejects.toMatchObject({
      i18nKey: 'parser.error.activobank_wrong_file',
    });
  });

  it('throws when ActivoBank statement has no extractable rows', async () => {
    mockPdfDocument(abPage('No transaction data here'));
    const file = new File([''], 'activobank_empty.pdf');
    await expect(parseActivoBankPdf(file)).rejects.toThrow(BrokerParsingError);
    await expect(parseActivoBankPdf(file)).rejects.toMatchObject({
      i18nKey: 'parser.error.activobank_no_rows',
    });
  });

  it('extracts a single G9 row with correct fields', async () => {
    // Pattern: <description> <country 3-digit> <shares> <sale date> <sale value> <purchase date> <purchase value> <expenses>
    mockPdfDocument(abPage(
      'Apple Inc 840 10 2025/06/16 1058.40 2024/06/26 1040.40 5.00'
    ));

    const file = new File([''], 'activobank.pdf');
    const data = await parseActivoBankPdf(file);

    expect(data.rowsG9).toHaveLength(1);
    const row = data.rowsG9[0];
    expect(row.titular).toBe('A');
    expect(row.nif).toBe('500734305');
    expect(row.codEncargos).toBe('G01');
    expect(row.paisContraparte).toBe('840');
    expect(row.anoRealizacao).toBe('2025');
    expect(row.mesRealizacao).toBe('6');
    expect(row.diaRealizacao).toBe('16');
    expect(row.valorRealizacao).toBe('1058.40');
    expect(row.anoAquisicao).toBe('2024');
    expect(row.mesAquisicao).toBe('6');
    expect(row.diaAquisicao).toBe('26');
    expect(row.valorAquisicao).toBe('1040.40');
    expect(row.despesasEncargos).toBe('5.00');
  });

  it('extracts multiple G9 rows', async () => {
    mockPdfDocument(abPage(
      'Apple Inc 840 10 2025/06/16 1058.40 2024/06/26 1040.40 5.00 ' +
      'Microsoft Corp 840 5 2025/07/01 500.00 2024/01/15 450.00 3.50'
    ));

    const file = new File([''], 'activobank_multi.pdf');
    const data = await parseActivoBankPdf(file);

    expect(data.rowsG9).toHaveLength(2);
    expect(data.rowsG9[0].valorRealizacao).toBe('1058.40');
    expect(data.rowsG9[1].valorRealizacao).toBe('500.00');
    expect(data.rowsG9[1].valorAquisicao).toBe('450.00');
    expect(data.rowsG9[1].despesasEncargos).toBe('3.50');
  });

  it('normalizes comma decimals to dots', async () => {
    mockPdfDocument(abPage(
      'Galp Energia 620 20 2025/03/10 1.058,40 2024/02/20 1.040,40 5,00'
    ));

    const file = new File([''], 'activobank_commas.pdf');
    const data = await parseActivoBankPdf(file);

    expect(data.rowsG9).toHaveLength(1);
    expect(data.rowsG9[0].valorRealizacao).toBe('1.058.40');
    expect(data.rowsG9[0].valorAquisicao).toBe('1.040.40');
    expect(data.rowsG9[0].despesasEncargos).toBe('5.00');
    expect(data.rowsG9[0].paisContraparte).toBe('620');
  });

  it('strips leading zeros from month and day', async () => {
    mockPdfDocument(abPage(
      'Sonae 620 15 2025/01/05 200.00 2024/01/02 180.00 2.00'
    ));

    const file = new File([''], 'activobank_dates.pdf');
    const data = await parseActivoBankPdf(file);

    expect(data.rowsG9[0].mesRealizacao).toBe('1');
    expect(data.rowsG9[0].diaRealizacao).toBe('5');
    expect(data.rowsG9[0].mesAquisicao).toBe('1');
    expect(data.rowsG9[0].diaAquisicao).toBe('2');
  });

  it('returns empty arrays for all other row types', async () => {
    mockPdfDocument(abPage(
      'Apple Inc 840 10 2025/06/16 1058.40 2024/06/26 1040.40 5.00'
    ));

    const file = new File([''], 'activobank.pdf');
    const data = await parseActivoBankPdf(file);

    expect(data.rows8A).toEqual([]);
    expect(data.rows92A).toEqual([]);
    expect(data.rows92B).toEqual([]);
    expect(data.rowsG13).toEqual([]);
    expect(data.rowsG18A).toEqual([]);
    expect(data.rowsG1q7).toEqual([]);
    expect(data.warnings).toEqual([]);
  });
});
