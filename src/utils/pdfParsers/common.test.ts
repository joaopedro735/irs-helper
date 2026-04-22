import { describe, it, expect, vi } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { normalizeNumber, extractPdfText, extractRows, matchesAnyMarker } from './common';
import { BrokerParsingError } from '../parserErrors';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

function mockPdf(pages: { str: string }[][], numPages?: number) {
  const pageCount = numPages ?? pages.length;
  vi.mocked(pdfjsLib.getDocument).mockReturnValue({
    promise: Promise.resolve({
      numPages: pageCount,
      getPage: vi.fn().mockImplementation((i: number) =>
        Promise.resolve({
          getTextContent: vi.fn().mockResolvedValue({ items: pages[i - 1] ?? [] }),
        })
      ),
    }),
  } as unknown as ReturnType<typeof pdfjsLib.getDocument>);
}

// ---------------------------------------------------------------------------
// normalizeNumber
// ---------------------------------------------------------------------------

describe('normalizeNumber', () => {
  it('replaces commas with dots', () => {
    expect(normalizeNumber('1,234,56')).toBe('1.234.56');
  });

  it('returns the same string when no commas are present', () => {
    expect(normalizeNumber('100.50')).toBe('100.50');
  });

  it('handles empty string', () => {
    expect(normalizeNumber('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// matchesAnyMarker
// ---------------------------------------------------------------------------

describe('matchesAnyMarker', () => {
  const markers = [/foo/i, /bar\s+baz/i];

  it('returns true when at least one marker matches', () => {
    expect(matchesAnyMarker('hello FOO world', markers)).toBe(true);
  });

  it('returns true for the second marker', () => {
    expect(matchesAnyMarker('some bar  baz text', markers)).toBe(true);
  });

  it('returns false when no marker matches', () => {
    expect(matchesAnyMarker('nothing here', markers)).toBe(false);
  });

  it('returns false for empty text', () => {
    expect(matchesAnyMarker('', markers)).toBe(false);
  });

  it('returns false for empty markers list', () => {
    expect(matchesAnyMarker('anything', [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractRows
// ---------------------------------------------------------------------------

describe('extractRows', () => {
  const regex = /(\d+)\s+([A-Z]+)/g;
  const buildRow = (m: RegExpExecArray) => ({ num: m[1], letters: m[2] });

  it('extracts matching rows from a single page', () => {
    const rows = extractRows(['123 ABC 456 DEF'], regex, buildRow);
    expect(rows).toEqual([
      { num: '123', letters: 'ABC' },
      { num: '456', letters: 'DEF' },
    ]);
  });

  it('extracts rows across multiple pages', () => {
    const rows = extractRows(['111 AA', '222 BB'], regex, buildRow);
    expect(rows).toEqual([
      { num: '111', letters: 'AA' },
      { num: '222', letters: 'BB' },
    ]);
  });

  it('returns empty array when nothing matches', () => {
    expect(extractRows(['no matches here'], regex, buildRow)).toEqual([]);
  });

  it('returns empty array for empty page texts', () => {
    expect(extractRows([], regex, buildRow)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractPdfText
// ---------------------------------------------------------------------------

describe('extractPdfText', () => {
  it('extracts text items joined by spaces from each page', async () => {
    mockPdf([
      [{ str: 'Hello' }, { str: ' ' }, { str: 'World' }],
      [{ str: 'Page2' }],
    ]);

    const result = await extractPdfText(new File([''], 'test.pdf'));
    expect(result).toEqual(['Hello   World', 'Page2']);
  });

  it('handles non-string str properties gracefully', async () => {
    mockPdf([
      [{ str: 'text' }, { str: '' } as { str: string }],
    ]);

    const result = await extractPdfText(new File([''], 'test.pdf'));
    expect(result).toEqual(['text ']);
  });

  it('throws BrokerParsingError when file exceeds max size', async () => {
    const bigFile = new File([''], 'big.pdf');
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });

    await expect(extractPdfText(bigFile)).rejects.toThrow(BrokerParsingError);
    await expect(extractPdfText(bigFile)).rejects.toMatchObject({
      i18nKey: 'parser.error.file_too_large',
    });
  });

  it('throws BrokerParsingError when PDF has too many pages', async () => {
    mockPdf([], 201);

    await expect(extractPdfText(new File([''], 'many_pages.pdf'))).rejects.toThrow(BrokerParsingError);
    await expect(extractPdfText(new File([''], 'many_pages.pdf'))).rejects.toMatchObject({
      i18nKey: 'parser.error.too_many_pages',
    });
  });
});
