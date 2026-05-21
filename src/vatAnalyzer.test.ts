import { describe, expect, it } from 'vitest'
import { analyzeVatText, parseMoney } from './vatAnalyzer'

describe('parseMoney', () => {
  it('parses Norwegian comma decimals and thousands separators', () => {
    expect(parseMoney('kr 1 234,50')).toBe(1234.5)
    expect(parseMoney('NOK 12.345,67')).toBe(12345.67)
  })
})

describe('analyzeVatText', () => {
  it('summarizes an explicit MVA amount label', () => {
    const result = analyzeVatText('MVA beløp: kr 250,00')

    expect(result.vatSummary).toMatchObject({
      state: 'found',
      amount: 250,
    })
    expect(result.keyFields[0]).toMatchObject({
      id: 'vat-total',
      value: '250,00 kr',
      status: 'found',
      lineNumber: 1,
    })
    expect(result.vatSummary.confidence).toBeGreaterThanOrEqual(76)
  })

  it('summarizes Herav MVA with rate before amount', () => {
    const result = analyzeVatText('Herav MVA 25% 123,45')

    expect(result.vatSummary).toMatchObject({
      state: 'found',
      amount: 123.45,
    })
  })

  it('summarizes OCR-ish MVA-belop text with NOK and thousands spaces', () => {
    const result = analyzeVatText('MVA-belop NOK 1 234,50')

    expect(result.vatSummary).toMatchObject({
      state: 'found',
      amount: 1234.5,
    })
  })

  it('returns a visible review summary when no VAT text is detected', () => {
    const result = analyzeVatText('Kaffe og papir\nTotalt: kr 349,00')

    expect(result.vatSummary).toMatchObject({
      state: 'needs-review',
      label: 'No MVA detected',
    })
    expect(result.vatSummary.candidates).toEqual([])
  })

  it('finds and validates a 25 percent MVA line against net and gross', () => {
    const result = analyzeVatText(`
      Netto grunnlag 25%: 1 200,00
      MVA 25%: 300,00
      Totalt a betale: 1 500,00
    `)

    expect(result.candidates[0]).toMatchObject({
      rate: 25,
      vatAmount: 300,
      status: 'pass',
    })
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(78)
  })

  it('flags a formula mismatch for caseworker review', () => {
    const result = analyzeVatText(`
      Netto 25%: 1 200,00
      MVA 25%: 299,00
      Total: 1 500,00
    `)

    expect(result.candidates[0].status).not.toBe('pass')
    expect(result.candidates[0].checks.join(' ')).toContain('differs')
  })

  it('supports 15 percent food VAT', () => {
    const result = analyzeVatText(`
      Mat netto 15%: 400,00
      moms 15%: 60,00
      Total: 460,00
    `)

    expect(result.candidates[0]).toMatchObject({
      rate: 15,
      vatAmount: 60,
      status: 'pass',
    })
  })

  it('prefers the only explicit MVA row over several item and ex-MVA amount rows', () => {
    const result = analyzeVatText(`
      Smortrele for styring av VVB 1,0 stk 1 17 100,00
      Arbeid montering 1,0 stk 1 2 400,00
      Materiell diverse 1,0 stk 1 980,00
      Totalt eks. mva 17 100,00
      Merverdiavgift 25.0% 4 275,00
      A betale 21 375,00
    `)

    expect(result.vatSummary).toMatchObject({
      state: 'found',
      amount: 4275,
    })
    expect(result.keyFields[0]).toMatchObject({
      id: 'vat-total',
      value: '4 275,00 kr',
      status: 'found',
      lineNumber: 5,
    })
    expect(result.candidates[0]).toMatchObject({
      rate: 25,
      vatAmount: 4275,
      status: 'pass',
      lineNumber: 5,
    })
    expect(result.candidates).not.toContainEqual(
      expect.objectContaining({
        rate: 0,
        vatAmount: 17100,
      }),
    )
  })

  it('handles 0 percent VAT as a zero amount candidate', () => {
    const result = analyzeVatText(`
      Eksport grunnlag 0%: 2 500,00
      VAT 0%: 0,00
      Total: 2 500,00
    `)

    expect(result.candidates[0]).toMatchObject({
      rate: 0,
      vatAmount: 0,
      status: 'pass',
    })
  })

  it('extracts Norwegian organisation number with MVA suffix', () => {
    const result = analyzeVatText('Org.nr. 313 623 890 MVA - EVIG USNOBBET APE')

    expect(result.keyFields.find((field) => field.id === 'org-number')).toMatchObject({
      value: '313 623 890',
      status: 'found',
      lineNumber: 1,
    })
  })

  it('extracts labelled recipient address blocks', () => {
    const result = analyzeVatText(`
      Mottaker:
      Skatteetaten, Postboks 9200 Gronland
      0134 OSLO
      Org.nr. 313 623 890 MVA
    `)

    expect(result.keyFields.find((field) => field.id === 'recipient-address')).toMatchObject({
      value: 'Skatteetaten, Postboks 9200 Gronland, 0134 OSLO',
      status: 'found',
      lineNumber: 2,
    })
  })

  it('infers recipient address from postal and street lines when label is missing', () => {
    const result = analyzeVatText(`
      EVIG USNOBBET APE
      v/ Real Naturressurs Akerbergveien 56A
      0650 OSLO
      Org.nr. 313 623 890 MVA
    `)

    expect(result.keyFields.find((field) => field.id === 'recipient-address')).toMatchObject({
      value: 'v/ Real Naturressurs Akerbergveien 56A, 0650 OSLO',
      status: 'found',
    })
  })
})
