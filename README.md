# MVA Bilag OCR POC

Browser-only proof of concept for caseworkers who need to check VAT/MVA amounts from receipts, bilag, and invoices.

Live demo: https://argos-odysseus.github.io/mva-bilag-ocr-poc/

## Scope

- Upload a receipt/invoice image and run browser-side OCR with Tesseract.js.
- Upload PDF invoices and render/OCR every page locally in the browser with PDF.js + Tesseract.js.
- Paste text directly when OCR is unavailable.
- Extract Norwegian VAT labels such as `MVA`, `mva`, `merverdiavgift`, `moms`, `VAT`.
- Detect rates `25%`, `15%`, `12%`, and `0%`.
- Parse Norwegian comma decimals and thousands separators, for example `kr 1 234,50`.
- Rank VAT candidates, validate net/VAT/gross formulas, and show confidence, status, and source snippets.
- Let a caseworker confirm or mark a candidate corrected.
- Includes embedded sample invoice text so the POC can be tried without a file.

This is a deterministic validator and OCR demo. It does not use local AI, VLMs, LLMs, or AI APIs.
PDF parsing, OCR, and preview rendering stay in-browser. The app now bundles local PDF/Tesseract worker and language assets so runtime OCR does not depend on remote CDN downloads.

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

- Image/PDF OCR runs in the browser and depends on source quality, scan orientation, and client CPU/memory.
- Multi-page PDFs are processed sequentially and combined into one OCR text stream. Field highlights are page-aware, but complex table layouts and weak OCR line geometry still need more production hardening.
- Candidate extraction is heuristic. It is designed to surface likely MVA rows for human review, not to auto-book accounting data.
- Rotated scans, table-heavy layouts, split VAT groups, and credit notes need more production hardening.
- No persistence, authentication, audit log, or backend workflow is included.

## Suggested Production Path

Use a server-side document pipeline:

- Normalize PDFs and scans with OCRmyPDF/Tesseract or PaddleOCR.
- Store original document, OCR text, page coordinates, and deterministic validation output.
- Keep the VAT validator deterministic and unit-tested.
- Add human review with explicit confirmation/correction states and an audit trail.
- Optionally add ML/AI later as a helper for layout classification, but do not make it the authority for VAT math.
