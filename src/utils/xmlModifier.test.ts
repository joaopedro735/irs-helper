import { describe, it, expect } from 'vitest';
import { enrichXmlWithGains } from './xmlModifier';
import type { ParsedPdfData, TaxRow, TaxRowG9, TaxRowG18A, TaxRowG1q7 } from '../types';

const makeParsedData = (overrides: Partial<ParsedPdfData>): ParsedPdfData => ({
  rows8A: [],
  rows92A: [],
  rows92B: [],
  rowsG9: [],
  rowsG13: [],
  rowsG18A: [],
  rowsG1q7: [],
  warnings: [],
  ...overrides,
});

const makeRow = (valorRealizacao: string, valorAquisicao: string): TaxRow => ({
  codPais: '372',
  codigo: 'G20',
  anoRealizacao: '2025',
  mesRealizacao: '6',
  diaRealizacao: '16',
  valorRealizacao,
  anoAquisicao: '2024',
  mesAquisicao: '6',
  diaAquisicao: '26',
  valorAquisicao,
  despesasEncargos: '0.00',
  impostoPagoNoEstrangeiro: '0.00',
  codPaisContraparte: '620',
});

// ---- XML fixtures ----

const xmlWithExistingRow = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoJ>
    <Quadro09>
      <AnexoJq092AT01>
        <AnexoJq092AT01-Linha numero="1">
          <NLinha>951</NLinha>
          <ValorRealizacao>10.00</ValorRealizacao>
          <ValorAquisicao>5.00</ValorAquisicao>
          <DespesasEncargos>0.00</DespesasEncargos>
          <ImpostoPagoNoEstrangeiro>0.00</ImpostoPagoNoEstrangeiro>
        </AnexoJq092AT01-Linha>
      </AnexoJq092AT01>
      <AnexoJq092AT01SomaC01>10.00</AnexoJq092AT01SomaC01>
      <AnexoJq092AT01SomaC02>5.00</AnexoJq092AT01SomaC02>
      <AnexoJq092AT01SomaC03>0.00</AnexoJq092AT01SomaC03>
      <AnexoJq092AT01SomaC04>0.00</AnexoJq092AT01SomaC04>
    </Quadro09>
  </AnexoJ>
</Modelo3IRSv2026>`;

const xmlWithEmptyContainer = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoJ>
    <Quadro08/>
    <Quadro09>
      <AnexoJq092AT01/>
      <AnexoJq092AT01SomaC01>0.00</AnexoJq092AT01SomaC01>
      <AnexoJq092AT01SomaC02>0.00</AnexoJq092AT01SomaC02>
      <AnexoJq092AT01SomaC03>0.00</AnexoJq092AT01SomaC03>
      <AnexoJq092AT01SomaC04>0.00</AnexoJq092AT01SomaC04>
    </Quadro09>
  </AnexoJ>
</Modelo3IRSv2026>`;

const xmlWithCleanQuadro09 = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoJ>
    <Quadro08/>
    <Quadro09/>
    <Quadro10/>
  </AnexoJ>
</Modelo3IRSv2026>`;

// ---- Tests ----

describe('xmlModifier – enrichXmlWithGains', () => {
  it('appends a row and updates sums when there is an existing row', () => {
    const { enrichedXml: result } = enrichXmlWithGains(xmlWithExistingRow, makeParsedData({ rows92A: [makeRow('100.00', '50.00')] }));

    expect(result).toContain('<NLinha>952</NLinha>');
    expect(result).toContain('<ValorRealizacao>100.00</ValorRealizacao>');
    expect(result).toContain('<AnexoJq092AT01SomaC01>110.00</AnexoJq092AT01SomaC01>');
    expect(result).toContain('<AnexoJq092AT01SomaC02>55.00</AnexoJq092AT01SomaC02>');
    expect(result).not.toContain('xmlns=""');
  });

  it('handles an empty self-closing container without producing xmlns attributes', () => {
    const { enrichedXml: result } = enrichXmlWithGains(xmlWithEmptyContainer, makeParsedData({ rows92A: [makeRow('200.00', '150.00')] }));

    expect(result).toContain('<NLinha>951</NLinha>');
    expect(result).toContain('<ValorRealizacao>200.00</ValorRealizacao>');
    expect(result).toContain('<AnexoJq092AT01SomaC01>200.00</AnexoJq092AT01SomaC01>');
    expect(result).toContain('<AnexoJq092AT01SomaC02>150.00</AnexoJq092AT01SomaC02>');
    expect(result).not.toContain('xmlns=""');
  });

  it('returns the original xml unchanged when no rows provided', () => {
    const result = enrichXmlWithGains(xmlWithExistingRow, makeParsedData({}));
    expect(result.enrichedXml).toBe(xmlWithExistingRow);
  });

  it('correctly sums multiple new rows', () => {
    const rows = [makeRow('100.00', '80.00'), makeRow('50.00', '40.00')];
    const { enrichedXml: result } = enrichXmlWithGains(xmlWithEmptyContainer, makeParsedData({ rows92A: rows }));

    expect(result).toContain('<NLinha>951</NLinha>');
    expect(result).toContain('<NLinha>952</NLinha>');
    expect(result).toContain('<AnexoJq092AT01SomaC01>150.00</AnexoJq092AT01SomaC01>');
    expect(result).toContain('<AnexoJq092AT01SomaC02>120.00</AnexoJq092AT01SomaC02>');
  });

  it('handles completely clean AnexoJ with self-closing <Quadro09/>', () => {
    const { enrichedXml: result } = enrichXmlWithGains(xmlWithCleanQuadro09, makeParsedData({ rows92A: [makeRow('20.00', '10.00')] }));

    expect(result).toContain('<Quadro09>');
    expect(result).toContain('</Quadro09>');
    expect(result).toContain('<NLinha>951</NLinha>');
    expect(result).toContain('<ValorRealizacao>20.00</ValorRealizacao>');
    expect(result).toContain('<AnexoJq092AT01SomaC01>20.00</AnexoJq092AT01SomaC01>');
  });

  it('injects 9.2 B rows and sum nodes correctly', () => {
    const { enrichedXml: result } = enrichXmlWithGains(xmlWithEmptyContainer, makeParsedData({
      rows92B: [{
        codigo: 'G98',
        codPais: '372',
        rendimentoLiquido: '25.32',
        impostoPagoNoEstrangeiro: '0.00',
        codPaisContraparte: '620'
      }],
    }));

    expect(result).toContain('<AnexoJq092BT01-Linha numero="1">');
    expect(result).toContain('<CodRendimento>G98</CodRendimento>');
    expect(result).toContain('<ImpostoPagoEstrangeiro>0.00</ImpostoPagoEstrangeiro>');
    expect(result).not.toContain('<CodPaisContraparte>');
    expect(result).toContain('<AnexoJq092BT01SomaC01>25.32</AnexoJq092BT01SomaC01>');
  });

  it('injects 8 A rows and sum nodes correctly', () => {
    const { enrichedXml: result } = enrichXmlWithGains(xmlWithEmptyContainer, makeParsedData({
      rows8A: [{
        codigo: 'E11',
        codPais: '840',
        rendimentoBruto: '3.71',
        impostoPago: '0.57'
      }],
    }));

    expect(result).toContain('<AnexoJq08AT01-Linha numero="1">');
    expect(result).toContain('<NLinha>801</NLinha>');
    expect(result).toContain('<CodRendimento>E11</CodRendimento>');
    expect(result).toContain('<RendimentoBruto>3.71</RendimentoBruto>');
    expect(result).toContain('<ImpostoPagoEstrangeiroPaisFonte>0.57</ImpostoPagoEstrangeiroPaisFonte>');
    expect(result).toContain('<AnexoJq08AT01SomaC01>3.71</AnexoJq08AT01SomaC01>');
    expect(result).toContain('<AnexoJq08AT01SomaC02>0.57</AnexoJq08AT01SomaC02>');
  });

  it('injects Anexo G Quadro 13 rows for CFDs correctly', () => {
    const xmlWithAnexoG = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoG>
    <Quadro13/>
  </AnexoG>
  <AnexoJ>
    <Quadro08/>
    <Quadro09/>
  </AnexoJ>
</Modelo3IRSv2026>`;

    const { enrichedXml: result } = enrichXmlWithGains(xmlWithAnexoG, makeParsedData({
      rowsG13: [{
        codigoOperacao: 'G51',
        titular: 'A',
        rendimentoLiquido: '-43.94',
        paisContraparte: '620'
      }],
    }));

    expect(result).toContain('<AnexoGq13T01-Linha numero="1">');
    expect(result).toContain('<CodigoOperacao>G51</CodigoOperacao>');
    expect(result).toContain('<Titular>A</Titular>');
    expect(result).toContain('<RendimentoLiquido>-43.94</RendimentoLiquido>');
    expect(result).toContain('<PaisContraparte>620</PaisContraparte>');
    expect(result).toContain('<AnexoGq13T01SomaC01>-43.94</AnexoGq13T01SomaC01>');
    // Should not inject into AnexoJ when only G13 rows present
    expect(result).not.toContain('<AnexoJq08AT01-Linha');
  });

  // ---- validateXmlShape tests ----

  it('throws when XML has no Modelo3 root node', () => {
    const badXml = '<?xml version="1.0"?><Root><AnexoJ/></Root>';
    expect(() => enrichXmlWithGains(badXml, makeParsedData({ rows92A: [makeRow('10.00', '5.00')] }))).toThrow(
      'Invalid XML: expected a Modelo3 root node.'
    );
  });

  it('throws when 8A rows present but no AnexoJ', () => {
    const noAnexoJ = '<?xml version="1.0"?><Modelo3IRSv2026><AnexoG/></Modelo3IRSv2026>';
    expect(() => enrichXmlWithGains(noAnexoJ, makeParsedData({
      rows8A: [{ codigo: 'E11', codPais: '840', rendimentoBruto: '10.00', impostoPago: '0.00' }],
    }))).toThrow('Anexo J is required');
  });

  it('throws when 92A rows present but no AnexoJ', () => {
    const noAnexoJ = '<?xml version="1.0"?><Modelo3IRSv2026><AnexoG/></Modelo3IRSv2026>';
    expect(() => enrichXmlWithGains(noAnexoJ, makeParsedData({
      rows92A: [makeRow('10.00', '5.00')],
    }))).toThrow('Anexo J is required');
  });

  it('throws when G9 rows present but no AnexoG', () => {
    const noAnexoG = `<?xml version="1.0"?><Modelo3IRSv2026><AnexoJ><Quadro09/></AnexoJ></Modelo3IRSv2026>`;
    const g9Row: TaxRowG9 = {
      titular: 'A', nif: '500734305', codEncargos: 'G01',
      anoRealizacao: '2025', mesRealizacao: '6', diaRealizacao: '1',
      valorRealizacao: '100.00', anoAquisicao: '2024', mesAquisicao: '1',
      diaAquisicao: '1', valorAquisicao: '50.00', despesasEncargos: '0.00',
      paisContraparte: '620',
    };
    expect(() => enrichXmlWithGains(noAnexoG, makeParsedData({ rowsG9: [g9Row] }))).toThrow(
      'Anexo G is required'
    );
  });

  it('throws when G18A rows present but no AnexoG', () => {
    const noAnexoG = `<?xml version="1.0"?><Modelo3IRSv2026><AnexoJ><Quadro09/></AnexoJ></Modelo3IRSv2026>`;
    const g18aRow: TaxRowG18A = {
      titular: 'A', codPaisEntGestora: '250',
      anoRealizacao: '2025', mesRealizacao: '6', diaRealizacao: '1',
      valorRealizacao: '600.00', anoAquisicao: '2025', mesAquisicao: '1',
      diaAquisicao: '15', valorAquisicao: '500.00', despesasEncargos: '0.00',
      codPaisContraparte: '250',
    };
    expect(() => enrichXmlWithGains(noAnexoG, makeParsedData({ rowsG18A: [g18aRow] }))).toThrow(
      'Anexo G is required for crypto'
    );
  });

  it('throws when G1q7 rows present but no AnexoG1', () => {
    const noAnexoG1 = `<?xml version="1.0"?><Modelo3IRSv2026><AnexoG><Quadro18/></AnexoG></Modelo3IRSv2026>`;
    const g1q7Row: TaxRowG1q7 = {
      titular: 'A', codPaisEntGestora: '250',
      anoRealizacao: '2025', mesRealizacao: '6', diaRealizacao: '1',
      valorRealizacao: '2000.00', anoAquisicao: '2023', mesAquisicao: '1',
      diaAquisicao: '1', valorAquisicao: '1500.00', despesasEncargos: '0.00',
      codPaisContraparte: '250',
    };
    expect(() => enrichXmlWithGains(noAnexoG1, makeParsedData({ rowsG1q7: [g1q7Row] }))).toThrow(
      'Anexo G1 is required'
    );
  });

  it('does not throw when annexes match data requirements', () => {
    const validXml = `<?xml version="1.0"?>
<Modelo3IRSv2026>
  <AnexoG><Quadro09/><Quadro13/><Quadro18/></AnexoG>
  <AnexoG1><Quadro07/></AnexoG1>
  <AnexoJ><Quadro08/><Quadro09/></AnexoJ>
</Modelo3IRSv2026>`;
    expect(() => enrichXmlWithGains(validXml, makeParsedData({
      rows8A: [{ codigo: 'E11', codPais: '840', rendimentoBruto: '10.00', impostoPago: '0.00' }],
      rowsG13: [{ codigoOperacao: 'G51', titular: 'A', rendimentoLiquido: '50.00', paisContraparte: '620' }],
    }))).not.toThrow();
  });

  // ---- Anexo G Quadro 9 (G9) injection tests ----

  it('injects Anexo G Quadro 9 rows for ActivoBank-style data', () => {
    const xmlWithAnexoG = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoG>
    <Quadro09/>
  </AnexoG>
</Modelo3IRSv2026>`;

    const g9Row: TaxRowG9 = {
      titular: 'A', nif: '500734305', codEncargos: 'G01',
      anoRealizacao: '2025', mesRealizacao: '6', diaRealizacao: '1',
      valorRealizacao: '100.00', anoAquisicao: '2024', mesAquisicao: '1',
      diaAquisicao: '15', valorAquisicao: '80.00', despesasEncargos: '2.50',
      paisContraparte: '620',
    };

    const { enrichedXml: result } = enrichXmlWithGains(xmlWithAnexoG, makeParsedData({ rowsG9: [g9Row] }));

    expect(result).toContain('<AnexoGq09T01-Linha numero="1">');
    expect(result).toContain('<Titular>A</Titular>');
    expect(result).toContain('<NIF>500734305</NIF>');
    expect(result).toContain('<CodEncargos>G01</CodEncargos>');
    expect(result).toContain('<ValorRealizacao>100.00</ValorRealizacao>');
    expect(result).toContain('<ValorAquisicao>80.00</ValorAquisicao>');
    expect(result).toContain('<DespesasEncargos>2.50</DespesasEncargos>');
    expect(result).toContain('<AnexoGq09T01SomaC01>100.00</AnexoGq09T01SomaC01>');
    expect(result).toContain('<AnexoGq09T01SomaC02>80.00</AnexoGq09T01SomaC02>');
    expect(result).toContain('<AnexoGq09T01SomaC03>2.50</AnexoGq09T01SomaC03>');
  });

  // ---- Anexo G Quadro 18A (crypto < 365 days) injection tests ----

  it('injects Anexo G Quadro 18A rows for crypto capital gains', () => {
    const xmlWithAnexoG = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoG>
    <Quadro18/>
  </AnexoG>
</Modelo3IRSv2026>`;

    const g18aRow: TaxRowG18A = {
      titular: 'A', codPaisEntGestora: '250',
      anoRealizacao: '2025', mesRealizacao: '6', diaRealizacao: '1',
      valorRealizacao: '600.00', anoAquisicao: '2025', mesAquisicao: '1',
      diaAquisicao: '15', valorAquisicao: '500.00', despesasEncargos: '4.00',
      codPaisContraparte: '250',
    };

    const { enrichedXml: result } = enrichXmlWithGains(xmlWithAnexoG, makeParsedData({ rowsG18A: [g18aRow] }));

    expect(result).toContain('<AnexoGq18AT01-Linha numero="1">');
    expect(result).toContain('<Titular>A</Titular>');
    expect(result).toContain('<CodPaisEntGestora>250</CodPaisEntGestora>');
    expect(result).toContain('<ValorRealizacao>600.00</ValorRealizacao>');
    expect(result).toContain('<ValorAquisicao>500.00</ValorAquisicao>');
    expect(result).toContain('<AnexoGq18AT01SomaC01>600.00</AnexoGq18AT01SomaC01>');
    expect(result).toContain('<AnexoGq18AT01SomaC02>500.00</AnexoGq18AT01SomaC02>');
    expect(result).toContain('<AnexoGq18AT01SomaC03>4.00</AnexoGq18AT01SomaC03>');
  });

  // ---- Anexo G1 Quadro 7 (crypto >= 365 days) injection tests ----

  it('injects Anexo G1 Quadro 7 rows for crypto held >= 365 days', () => {
    const xmlWithAnexoG1 = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoG1>
    <Quadro07/>
  </AnexoG1>
</Modelo3IRSv2026>`;

    const g1q7Row: TaxRowG1q7 = {
      titular: 'A', codPaisEntGestora: '250',
      anoRealizacao: '2025', mesRealizacao: '6', diaRealizacao: '1',
      valorRealizacao: '2000.00', anoAquisicao: '2023', mesAquisicao: '1',
      diaAquisicao: '1', valorAquisicao: '1500.00', despesasEncargos: '0.00',
      codPaisContraparte: '250',
    };

    const { enrichedXml: result } = enrichXmlWithGains(xmlWithAnexoG1, makeParsedData({ rowsG1q7: [g1q7Row] }));

    expect(result).toContain('<AnexoG1q07T01-Linha numero="1">');
    expect(result).toContain('<Titular>A</Titular>');
    expect(result).toContain('<CodPaisEntGestora>250</CodPaisEntGestora>');
    expect(result).toContain('<ValorRealizacao>2000.00</ValorRealizacao>');
    expect(result).toContain('<ValorAquisicao>1500.00</ValorAquisicao>');
    expect(result).toContain('<AnexoG1q07T01SomaC01>2000.00</AnexoG1q07T01SomaC01>');
    expect(result).toContain('<AnexoG1q07T01SomaC02>1500.00</AnexoG1q07T01SomaC02>');
    expect(result).toContain('<AnexoG1q07T01SomaC03>0.00</AnexoG1q07T01SomaC03>');
  });

  // ---- Combined injection: multiple table types simultaneously ----

  it('injects 8A + 92A + G13 simultaneously without corrupting XML', () => {
    const xmlMulti = `<?xml version="1.0" encoding="UTF-8"?>
<Modelo3IRSv2026 xmlns="http://www.dgci.gov.pt/2009/Modelo3IRSv2026">
  <AnexoG>
    <Quadro09></Quadro09>
    <Quadro13></Quadro13>
  </AnexoG>
  <AnexoJ>
    <Quadro08></Quadro08>
    <Quadro09>
      <AnexoJq092AT01/>
    </Quadro09>
  </AnexoJ>
</Modelo3IRSv2026>`;

    const { enrichedXml: result, summary } = enrichXmlWithGains(xmlMulti, makeParsedData({
      rows8A: [{ codigo: 'E11', codPais: '840', rendimentoBruto: '3.71', impostoPago: '0.57' }],
      rows92A: [makeRow('100.00', '50.00')],
      rowsG13: [{ codigoOperacao: 'G51', titular: 'A', rendimentoLiquido: '-43.94', paisContraparte: '620' }],
    }));

    expect(result).toContain('<AnexoJq08AT01-Linha');
    expect(result).toContain('<AnexoJq092AT01-Linha');
    expect(result).toContain('<AnexoGq13T01-Linha');
    expect(summary.totalRowsAdded).toBe(3);
  });

  // ---- EnrichmentSummary correctness tests ----

  it('returns correct totalRowsAdded across all tables', () => {
    const xmlFull = `<?xml version="1.0"?>
<Modelo3IRSv2026>
  <AnexoJ>
    <Quadro08></Quadro08>
    <Quadro09>
      <AnexoJq092AT01/>
    </Quadro09>
  </AnexoJ>
</Modelo3IRSv2026>`;

    const { summary } = enrichXmlWithGains(xmlFull, makeParsedData({
      rows8A: [
        { codigo: 'E11', codPais: '840', rendimentoBruto: '10.00', impostoPago: '1.00' },
        { codigo: 'E21', codPais: '372', rendimentoBruto: '5.00', impostoPago: '0.00' },
      ],
      rows92A: [makeRow('100.00', '50.00')],
    }));

    expect(summary.table8A.rowsAdded).toBe(2);
    expect(summary.table92A.rowsAdded).toBe(1);
    expect(summary.totalRowsAdded).toBe(3);
  });

  it('returns correct formatted totals for 8A rows', () => {
    const xmlFull = `<?xml version="1.0"?>
<Modelo3IRSv2026>
  <AnexoJ><Quadro08/><Quadro09/></AnexoJ>
</Modelo3IRSv2026>`;

    const { summary } = enrichXmlWithGains(xmlFull, makeParsedData({
      rows8A: [
        { codigo: 'E11', codPais: '840', rendimentoBruto: '10.50', impostoPago: '1.25' },
        { codigo: 'E11', codPais: '276', rendimentoBruto: '5.25', impostoPago: '0.75' },
      ],
    }));

    expect(summary.table8A.totals).toEqual([
      { label: 'report.totals.gross_income', value: '15.75', currency: true },
      { label: 'report.totals.tax_paid_abroad', value: '2.00', currency: true },
    ]);
  });

  it('returns sources from passed sources argument', () => {
    const xmlFull = `<?xml version="1.0"?>
<Modelo3IRSv2026>
  <AnexoJ><Quadro08/><Quadro09/></AnexoJ>
</Modelo3IRSv2026>`;

    const { summary } = enrichXmlWithGains(xmlFull, makeParsedData({
      rows8A: [{ codigo: 'E11', codPais: '840', rendimentoBruto: '10.00', impostoPago: '0.00' }],
    }), {
      table8A: ['Trade Republic', 'Trading 212'],
      table92A: [], table92B: [], tableG9: [], tableG13: [], tableG18A: [], tableG1q7: [],
    });

    expect(summary.table8A.sources).toEqual(['Trade Republic', 'Trading 212']);
  });

  it('returns empty totals and sources for zero-row tables', () => {
    const { summary } = enrichXmlWithGains(xmlWithExistingRow, makeParsedData({}));

    expect(summary.table8A.totals).toEqual([]);
    expect(summary.table8A.sources).toEqual([]);
    expect(summary.table92A.totals).toEqual([]);
    expect(summary.tableG13.totals).toEqual([]);
    expect(summary.totalRowsAdded).toBe(0);
  });
});
