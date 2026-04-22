import { describe, it, expect, vi } from 'vitest';
import { parseFreedom24Pdf } from './freedom24Parser';
import { BrokerParsingError } from '../parserErrors';
import { mockPdfDocument } from './testHelper';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

const F24_HEADER = 'Freedom24 Trade report for a tax return ';

function f24Page(body: string): { str: string }[] {
  return [{ str: F24_HEADER + body }];
}

describe('parseFreedom24Pdf', () => {
  // -----------------------------------------------------------------------
  // Marker detection
  // -----------------------------------------------------------------------

  it('throws when file does not match Freedom24 markers', async () => {
    mockPdfDocument([{ str: 'Completely unrelated document' }]);
    const file = new File([''], 'other.pdf');
    await expect(parseFreedom24Pdf(file)).rejects.toThrow(BrokerParsingError);
    await expect(parseFreedom24Pdf(file)).rejects.toMatchObject({
      i18nKey: 'parser.error.freedom24_wrong_file',
    });
  });

  it('throws when Freedom24 report has no extractable rows', async () => {
    mockPdfDocument(f24Page('No transaction data here'));
    const file = new File([''], 'freedom24_empty.pdf');
    await expect(parseFreedom24Pdf(file)).rejects.toThrow(BrokerParsingError);
    await expect(parseFreedom24Pdf(file)).rejects.toMatchObject({
      i18nKey: 'parser.error.freedom24_no_rows',
    });
  });

  // -----------------------------------------------------------------------
  // Dividends → rows8A
  // -----------------------------------------------------------------------

  it('extracts a single dividend row into rows8A', async () => {
    // Pattern: <7+digit ID> <date> <ticker> <ISIN> dividend <tax fields> <currency> <gross> <exchange rate> <EUR amount>
    mockPdfDocument(f24Page(
      '1234567 2025-07-10 AAPL US0378331005 dividend USD 10.50 1.08 9.72'
    ));

    const file = new File([''], 'freedom24_div.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows8A).toHaveLength(1);
    expect(data.rows8A[0].codigo).toBe('E11');
    expect(data.rows8A[0].codPais).toBe('840');
    expect(data.rows8A[0].rendimentoBruto).toBe('9.72');
    expect(data.rows8A[0].impostoPago).toBe('0.00');
  });

  it('extracts dividend with tax fields and computes impostoPago', async () => {
    // Tax fields: "1.50USD " → total tax = 1.50 * exchange rate 1.08 = 1.62
    mockPdfDocument(f24Page(
      '1234567 2025-07-10 AAPL US0378331005 dividend 1.50USD USD 10.50 1.08 9.72'
    ));

    const file = new File([''], 'freedom24_div_tax.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows8A).toHaveLength(1);
    expect(data.rows8A[0].impostoPago).toBe('1.62');
  });

  it('extracts coupon row same as dividend', async () => {
    mockPdfDocument(f24Page(
      '9876543 2025-03-15 BOND DE000A0F6MD5 coupon EUR 25.00 1.00 25.00'
    ));

    const file = new File([''], 'freedom24_coupon.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows8A).toHaveLength(1);
    expect(data.rows8A[0].codigo).toBe('E11');
    expect(data.rows8A[0].codPais).toBe('276');
    expect(data.rows8A[0].rendimentoBruto).toBe('25.00');
  });

  it('extracts multiple dividend rows', async () => {
    mockPdfDocument(f24Page(
      '1234567 2025-07-10 AAPL US0378331005 dividend USD 10.50 1.08 9.72 ' +
      '1234568 2025-08-10 MSFT US5949181045 dividend 0.50USD USD 5.00 1.10 4.55'
    ));

    const file = new File([''], 'freedom24_multi_div.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows8A).toHaveLength(2);
    expect(data.rows8A[0].rendimentoBruto).toBe('9.72');
    expect(data.rows8A[1].rendimentoBruto).toBe('4.55');
    expect(data.rows8A[1].impostoPago).toBe('0.55');
  });

  // -----------------------------------------------------------------------
  // Stock trades → rows92A (FIFO matching)
  // -----------------------------------------------------------------------

  it('extracts a matched buy+sell pair into rows92A', async () => {
    // Pattern: <ID> <num> <ticker> <ISIN> Stocks <exchange> Buy/Sell <qty> <price> <currency> <amount> <pnl> <rate> <value> <fee><CCY> <date>
    mockPdfDocument(f24Page(
      '1234567 1 AAPL US0378331005 Stocks NASDAQ Buy 10 150.00 USD 1500.00 0.00 1.08 0.00 2.00USD 2025-01-10 ' +
      '1234568 2 AAPL US0378331005 Stocks NASDAQ Sell 10 200.00 USD 2000.00 500.00 1.10 0.00 3.00USD 2025-06-15'
    ));

    const file = new File([''], 'freedom24_trade.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows92A).toHaveLength(1);
    const row = data.rows92A[0];
    expect(row.codigo).toBe('G20');
    expect(row.codPais).toBe('840');
    expect(row.codPaisContraparte).toBe('840');
    expect(row.anoRealizacao).toBe('2025');
    expect(row.mesRealizacao).toBe('6');
    expect(row.diaRealizacao).toBe('15');
    expect(row.anoAquisicao).toBe('2025');
    expect(row.mesAquisicao).toBe('1');
    expect(row.diaAquisicao).toBe('10');
    // sell: 2000 * 1.10 = 2200.00
    expect(row.valorRealizacao).toBe('2200.00');
    // buy: 1500 * 1.08 = 1620.00
    expect(row.valorAquisicao).toBe('1620.00');
    // fees: sell 3.00 * 1.10 + buy 2.00 * 1.08 = 3.30 + 2.16 = 5.46
    expect(row.despesasEncargos).toBe('5.46');
    expect(row.impostoPagoNoEstrangeiro).toBe('0.00');
  });

  it('performs FIFO matching splitting sell across multiple buys', async () => {
    mockPdfDocument(f24Page(
      '1234567 1 AAPL US0378331005 Stocks NASDAQ Buy 5 100.00 USD 500.00 0.00 1.00 0.00 1.00USD 2025-01-10 ' +
      '1234568 2 AAPL US0378331005 Stocks NASDAQ Buy 5 120.00 USD 600.00 0.00 1.00 0.00 1.00USD 2025-02-10 ' +
      '1234569 3 AAPL US0378331005 Stocks NASDAQ Sell 10 150.00 USD 1500.00 0.00 1.00 0.00 2.00USD 2025-06-15'
    ));

    const file = new File([''], 'freedom24_fifo.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows92A).toHaveLength(2);
    // First row: 5 of 10 sold matched to first buy
    expect(data.rows92A[0].valorRealizacao).toBe('750.00');  // 1500 * 5/10 * 1.0
    expect(data.rows92A[0].valorAquisicao).toBe('500.00');   // 500 * 5/5 * 1.0
    expect(data.rows92A[0].diaAquisicao).toBe('10');
    expect(data.rows92A[0].mesAquisicao).toBe('1');
    // Second row: remaining 5 matched to second buy
    expect(data.rows92A[1].valorRealizacao).toBe('750.00');
    expect(data.rows92A[1].valorAquisicao).toBe('600.00');
    expect(data.rows92A[1].mesAquisicao).toBe('2');
  });

  it('handles partial lot matching (sell qty < buy qty)', async () => {
    mockPdfDocument(f24Page(
      '1234567 1 AAPL US0378331005 Stocks NASDAQ Buy 10 100.00 USD 1000.00 0.00 1.00 0.00 0.00USD 2025-01-10 ' +
      '1234568 2 AAPL US0378331005 Stocks NASDAQ Sell 4 150.00 USD 600.00 0.00 1.00 0.00 0.00USD 2025-06-15'
    ));

    const file = new File([''], 'freedom24_partial.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows92A).toHaveLength(1);
    // sell: 600 * 4/4 * 1.0 = 600
    expect(data.rows92A[0].valorRealizacao).toBe('600.00');
    // buy: 1000 * 4/10 * 1.0 = 400
    expect(data.rows92A[0].valorAquisicao).toBe('400.00');
  });

  it('ignores buy-only trades (no sell → no rows)', async () => {
    mockPdfDocument(f24Page(
      '1234567 1 AAPL US0378331005 Stocks NASDAQ Buy 10 100.00 USD 1000.00 0.00 1.00 0.00 0.00USD 2025-01-10'
    ));

    const file = new File([''], 'freedom24_buy_only.pdf');
    // Buy only → no rows92A → no total rows → throws no_rows
    await expect(parseFreedom24Pdf(file)).rejects.toMatchObject({
      i18nKey: 'parser.error.freedom24_no_rows',
    });
  });

  // -----------------------------------------------------------------------
  // Mixed data
  // -----------------------------------------------------------------------

  it('returns both dividends and trades in a single report', async () => {
    mockPdfDocument(f24Page(
      '1234567 2025-07-10 AAPL US0378331005 dividend USD 10.50 1.00 10.50 ' +
      '2234567 1 MSFT US5949181045 Stocks NASDAQ Buy 5 100.00 USD 500.00 0.00 1.00 0.00 0.00USD 2025-01-10 ' +
      '2234568 2 MSFT US5949181045 Stocks NASDAQ Sell 5 120.00 USD 600.00 0.00 1.00 0.00 0.00USD 2025-06-15'
    ));

    const file = new File([''], 'freedom24_mixed.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows8A).toHaveLength(1);
    expect(data.rows92A).toHaveLength(1);
    expect(data.rows92B).toEqual([]);
    expect(data.rowsG9).toEqual([]);
    expect(data.rowsG13).toEqual([]);
    expect(data.warnings).toEqual([]);
  });

  it('resolves country code from ISIN prefix', async () => {
    // DE prefix → Germany → 276
    mockPdfDocument(f24Page(
      '1234567 2025-03-15 SAP DE000A0F6MD5 dividend EUR 25.00 1.00 25.00'
    ));

    const file = new File([''], 'freedom24_de.pdf');
    const data = await parseFreedom24Pdf(file);

    expect(data.rows8A[0].codPais).toBe('276');
  });
});
