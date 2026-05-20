# MVA Bilag OCR POC

Browser-only proof of concept for caseworkers who need to check VAT/MVA amounts from receipts, bilag, and invoices.

## Scope

- Upload a receipt/invoice image and run browser-side OCR with Tesseract.js.
- Paste text directly when OCR is unavailable or a PDF has already been processed elsewhere.
- Extract Norwegian VAT labels such as `MVA`, `mva`, `merverdiavgift`, `moms`, `VAT`.
- Detect rates `25%`, `15%`, `12%`, and `0%`.
- Parse Norwegian comma decimals and thousands separators, for example `kr 1 234,50`.
- Rank VAT candidates, validate net/VAT/gross formulas, and show confidence, status, and source snippets.
- Let a caseworker confirm or mark a candidate corrected.
- Includes embedded sample invoice text so the POC can be tried without a file.

This is a deterministic validator and OCR demo. It does not use local AI, VLMs, LLMs, or AI APIs.

## Run Locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm run test
npm run build
npm run lint
```

## Limitations

- Image OCR runs in the browser and depends on image clarity, orientation, and Tesseract.js language data loading.
- PDF OCR is intentionally not implemented in this frontend-only POC. Paste extracted text or convert scanned PDFs to images/text first.
- Candidate extraction is heuristic. It is designed to surface likely MVA rows for human review, not to auto-book accounting data.
- Multi-page invoices, rotated scans, table-heavy layouts, split VAT groups, and credit notes need more production hardening.
- No persistence, authentication, audit log, or backend workflow is included.

## Suggested Production Path

Use a server-side document pipeline:

- Normalize PDFs and scans with OCRmyPDF/Tesseract or PaddleOCR.
- Store original document, OCR text, page coordinates, and deterministic validation output.
- Keep the VAT validator deterministic and unit-tested.
- Add human review with explicit confirmation/correction states and an audit trail.
- Optionally add ML/AI later as a helper for layout classification, but do not make it the authority for VAT math.
