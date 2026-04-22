import { describe, it, expect, vi } from 'vitest';
import { parseTrading212Pdf } from './trading212Parser';
import { resolveCountryCode } from '../brokerCountries';
import { BrokerParsingError } from '../parserErrors';
import { mockPdfDocument } from './testHelper';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

describe('parseTrading212Pdf', () => {
  it('should extract interest (E21) and dividends (E11) from T212 annual statement', async () => {
    mockPdfDocument([
      { str: 'Annual Statement - 2025  Overview  Trading 212 Invest  Interest on cash   €133.37  Share lending interest   €0.02  Dividends by country  ISSUING COUNTRY GROSS AMOUNT (EUR)   WHT RATE   WHT (EUR)   NET AMOUNT (EUR)  Germany   0.29   26%   0.08   0.21  Denmark   25.33   27%   6.84   18.49  United Kingdom   2.89   -   -   2.89  Dividends by instrument  INSTRUMENT' },
    ]);

    const fakeFile = new File([''], 't212_statement.pdf');
    const data = await parseTrading212Pdf(fakeFile);

    // Interest: 133.37 + 0.02 = 133.39 as E21, country 196 (Cyprus)
    expect(data.rows8A[0]).toEqual({
      codigo: 'E21',
      codPais: '196',
      rendimentoBruto: '133.39',
      impostoPago: '0.00',
    });

    // Dividends: 3 countries as E11
    expect(data.rows8A[1]).toEqual({
      codigo: 'E11',
      codPais: '276',
      rendimentoBruto: '0.29',
      impostoPago: '0.08',
    });

    expect(data.rows8A[2]).toEqual({
      codigo: 'E11',
      codPais: '208',
      rendimentoBruto: '25.33',
      impostoPago: '6.84',
    });

    expect(data.rows8A[3]).toEqual({
      codigo: 'E11',
      codPais: '826',
      rendimentoBruto: '2.89',
      impostoPago: '0.00',
    });

    expect(data.rows8A.length).toBe(4);
    expect(data.rows92A.length).toBe(0);
    expect(data.rows92B.length).toBe(0);
    expect(data.rowsG13.length).toBe(0);
  });

  it('should extract only interest when no dividends section exists', async () => {
    mockPdfDocument([
      { str: 'Annual Statement - 2025  Trading 212 Invest  Interest on cash   €50.00  Share lending interest   €0.00' },
    ]);

    const fakeFile = new File([''], 't212_interest_only.pdf');
    const data = await parseTrading212Pdf(fakeFile);

    expect(data.rows8A.length).toBe(1);
    expect(data.rows8A[0]).toEqual({
      codigo: 'E21',
      codPais: '196',
      rendimentoBruto: '50.00',
      impostoPago: '0.00',
    });
  });

  it('should handle thousand separators in T212 numbers', async () => {
    mockPdfDocument([
      { str: 'Annual Statement - 2025  Trading 212  Interest on cash   €1,234.56  Share lending interest   €0.00' },
    ]);

    const fakeFile = new File([''], 't212_large_interest.pdf');
    const data = await parseTrading212Pdf(fakeFile);

    expect(data.rows8A[0].rendimentoBruto).toBe('1234.56');
  });

  it('should throw PdfParsingError when file is not a T212 report', async () => {
    mockPdfDocument([
      { str: 'Some random document with no broker markers' },
    ]);

    const fakeFile = new File([''], 'not_t212.pdf');
    await expect(parseTrading212Pdf(fakeFile)).rejects.toThrow(BrokerParsingError);
    await expect(parseTrading212Pdf(fakeFile)).rejects.toMatchObject({
      i18nKey: 'parser.error.t212_wrong_file',
    });
  });

  it('should throw PdfParsingError when T212 report has no extractable data', async () => {
    mockPdfDocument([
      { str: 'Annual Statement - 2025  Trading 212  Interest on cash   €0.00  Share lending interest   €0.00' },
    ]);

    const fakeFile = new File([''], 't212_empty.pdf');
    await expect(parseTrading212Pdf(fakeFile)).rejects.toThrow(BrokerParsingError);
    await expect(parseTrading212Pdf(fakeFile)).rejects.toMatchObject({
      i18nKey: 'parser.error.t212_no_rows',
    });
  });
});

describe('resolveCountryCode', () => {
  it('should resolve known country names to IRS codes', () => {
    expect(resolveCountryCode('Germany')).toBe('276');
    expect(resolveCountryCode('Denmark')).toBe('208');
    expect(resolveCountryCode('United Kingdom')).toBe('826');
    expect(resolveCountryCode('United States')).toBe('840');
    expect(resolveCountryCode('Spain')).toBe('724');
    expect(resolveCountryCode('Netherlands')).toBe('528');
    expect(resolveCountryCode('Cyprus')).toBe('196');
  });

  it('should return undefined for unknown country names', () => {
    expect(resolveCountryCode('Atlantis')).toBeUndefined();
    expect(resolveCountryCode('')).toBeUndefined();
  });
});
