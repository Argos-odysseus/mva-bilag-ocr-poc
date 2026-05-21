import { describe, expect, it } from 'vitest'
import { analyzeVatText } from './vatAnalyzer'
import { getSupportedDocumentKind, getUnsupportedDocumentMessage, isSupportedDocumentFile, joinDocumentPageText } from './documentIntake'

describe('document intake helpers', () => {
  it('detects image files from mime type', () => {
    expect(getSupportedDocumentKind({ name: 'receipt.png', type: 'image/png' })).toBe('image')
    expect(isSupportedDocumentFile({ name: 'receipt.png', type: 'image/png' })).toBe(true)
  })

  it('detects pdf files from mime type or file extension', () => {
    expect(getSupportedDocumentKind({ name: 'invoice.pdf', type: 'application/pdf' })).toBe('pdf')
    expect(getSupportedDocumentKind({ name: 'invoice.PDF', type: '' })).toBe('pdf')
  })

  it('rejects unsupported files with a clear message', () => {
    const file = { name: 'notes.txt', type: 'text/plain' }

    expect(isSupportedDocumentFile(file)).toBe(false)
    expect(getUnsupportedDocumentMessage(file)).toContain('Upload a PDF or an image')
  })

  it('joins multi-page OCR text cleanly for deterministic extraction', () => {
    const combined = joinDocumentPageText([
      { text: 'Faktura 1042\nNetto grunnlag 25%: kr 1 200,00' },
      { text: 'MVA 25%: kr 300,00\nTotalt a betale: kr 1 500,00' },
    ])

    expect(combined).toContain('\n\n')
    expect(analyzeVatText(combined).vatSummary).toMatchObject({
      state: 'found',
      amount: 300,
    })
  })
})
