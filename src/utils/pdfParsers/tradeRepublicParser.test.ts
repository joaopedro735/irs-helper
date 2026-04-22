import { describe, it, expect, vi } from 'vitest';
import { parseTradeRepublicPdf } from './tradeRepublicParser';
import { BrokerParsingError } from '../parserErrors';
import { mockPdfDocument } from './testHelper';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

describe('parseTradeRepublicPdf', () => {
  it('should extract 8A rows from a TR report', async () => {
    mockPdfDocument([
      { str: 'Trade Republic Tax Report 2025' },
      { str: ' ' },
      { str: '801' },
      { str: ' ' },
      { str: 'E21 (28%)' },
      { str: ' ' },
      { str: '276' },
      { str: ' ' },
      { str: '110,8900' },
      { str: ' ' },
      { str: '0,0000' },
    ]);

    const fakeFile = new File([''], 'tr_report.pdf');
    const data = await parseTradeRepublicPdf(fakeFile);

    expect(data.rows8A.length).toBe(1);
    expect(data.rows8A[0].codigo).toBe('E21');
    expect(data.rows92A.length).toBe(0);
    expect(data.rows92B.length).toBe(0);
    expect(data.rowsG13.length).toBe(0);
  });

  it('should throw PdfParsingError when file is not a TR report', async () => {
    mockPdfDocument([
      { str: 'Some random document with no broker markers' },
    ]);

    const fakeFile = new File([''], 'not_tr.pdf');
    await expect(parseTradeRepublicPdf(fakeFile)).rejects.toThrow(BrokerParsingError);
    await expect(parseTradeRepublicPdf(fakeFile)).rejects.toMatchObject({
      i18nKey: 'parser.error.tr_wrong_file',
    });
  });

  it('should throw PdfParsingError when TR report has no 8A data', async () => {
    mockPdfDocument([
      { str: 'Trade Republic Tax Report 2025 - no data' },
    ]);

    const fakeFile = new File([''], 'tr_empty.pdf');
    await expect(parseTradeRepublicPdf(fakeFile)).rejects.toThrow(BrokerParsingError);
    await expect(parseTradeRepublicPdf(fakeFile)).rejects.toMatchObject({
      i18nKey: 'parser.error.tr_no_rows',
    });
  });
});
