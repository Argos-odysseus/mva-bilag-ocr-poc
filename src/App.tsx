import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import './App.css'
import { getUnsupportedDocumentMessage, isSupportedDocumentFile } from './documentIntake'
import { recognizeDocument, type OcrLine, type OcrPreviewPage, type OcrProgress } from './ocrAdapter'
import { analyzeVatText, formatNok, SAMPLE_TEXT, type KeyField, type VatCandidate, type VatSummary } from './vatAnalyzer'

type ConfirmedState = Record<string, 'confirmed' | 'corrected'>

function App() {
  const [text, setText] = useState(SAMPLE_TEXT)
  const [fileName, setFileName] = useState('Embedded sample')
  const [documentPages, setDocumentPages] = useState<OcrPreviewPage[]>([])
  const [ocrLines, setOcrLines] = useState<OcrLine[]>([])
  const [activeFieldId, setActiveFieldId] = useState<KeyField['id']>('vat-total')
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null)
  const [ocrError, setOcrError] = useState('')
  const [confirmed, setConfirmed] = useState<ConfirmedState>({})
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const analysis = useMemo(() => analyzeVatText(text), [text])

  useEffect(() => {
    return () => {
      documentPages.forEach((page) => {
        if (page.revokeUrl) URL.revokeObjectURL(page.imageUrl)
      })
    }
  }, [documentPages])

  function loadSample() {
    setText(SAMPLE_TEXT)
    setFileName('Embedded sample')
    setDocumentPages([])
    setOcrLines([])
    setConfirmed({})
    setOcrError('')
    setOcrProgress(null)
  }

  function updatePageSize(pageNumber: number, width: number, height: number) {
    setDocumentPages((currentPages) =>
      currentPages.map((page) => (page.pageNumber === pageNumber && (page.width !== width || page.height !== height) ? { ...page, width, height } : page)),
    )
  }

  async function handleFile(file: File | undefined) {
    if (!file) return

    if (!isSupportedDocumentFile(file)) {
      setFileName(file.name)
      setOcrError(getUnsupportedDocumentMessage(file))
      setOcrProgress(null)
      setDocumentPages([])
      setOcrLines([])
      return
    }

    setFileName(file.name)
    setOcrError('')
    setOcrProgress({ status: 'Preparing OCR', progress: 0 })
    setActiveFieldId('vat-total')
    setOcrLines([])
    setDocumentPages([])

    try {
      const result = await recognizeDocument(file, setOcrProgress)
      setText(result.text || '')
      setOcrLines(result.lines)
      setDocumentPages(result.pages)
      setConfirmed({})
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'OCR failed')
    } finally {
      setOcrProgress(null)
    }
  }

  function focusField(field: KeyField) {
    setActiveFieldId(field.id)
    const target = fieldRefs.current[field.id]
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const previewStatus =
    documentPages.length > 0
      ? `${documentPages.length} rendered page${documentPages.length === 1 ? '' : 's'} with local OCR markers`
      : 'Text preview fallback'

  return (
    <main className="caseworker-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MVA Bilag OCR POC</p>
          <h1>VAT control desk</h1>
        </div>
        <div className="status-strip" aria-label="Validation summary">
          <SummaryPill label="Pass" value={analysis.summary.pass} tone="pass" />
          <SummaryPill label="Review" value={analysis.summary.review} tone="review" />
          <SummaryPill label="Fail" value={analysis.summary.fail} tone="fail" />
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="input-panel">
          <div className="panel-heading">
            <h2>Document intake</h2>
            <button type="button" onClick={loadSample}>
              Load sample
            </button>
          </div>

          <label className="dropzone">
            <input type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => void handleFile(event.target.files?.[0])} />
            <span>Upload image or PDF</span>
            <small>{fileName}</small>
            <em>Processed locally in the browser. No upload endpoint.</em>
          </label>

          {ocrProgress && (
            <div className="progress">
              <div>
                <span>{ocrProgress.status}</span>
                <span>{Math.round(ocrProgress.progress * 100)}%</span>
              </div>
              {(ocrProgress.currentPage ?? 0) > 0 && (ocrProgress.totalPages ?? 0) > 1 && (
                <p>
                  OCR page {ocrProgress.currentPage} of {ocrProgress.totalPages}
                </p>
              )}
              <progress value={ocrProgress.progress} max={1} />
            </div>
          )}
          {ocrError && <p className="error">{ocrError}</p>}

          <label className="text-editor">
            OCR or pasted text
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setOcrLines([])
              }}
              spellCheck={false}
            />
          </label>
        </aside>

        <section className="results-panel">
          <div className="panel-heading">
            <h2>Document VAT audit</h2>
            <span>{analysis.vatSummary.state === 'found' ? 'Ready for review' : 'Manual review needed'}</span>
          </div>

          <VatSummaryCard summary={analysis.vatSummary} />

          <div className="candidate-section-heading">
            <h2>Line-level evidence</h2>
            <span>{analysis.candidates.length} candidate lines</span>
          </div>

          <div className="candidate-list">
            {analysis.candidates.length === 0 ? (
              <div className="empty-state">No MVA/VAT candidates found. Paste invoice text or upload a clearer image/PDF.</div>
            ) : (
              analysis.candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  state={confirmed[candidate.id]}
                  onSetState={(state) => setConfirmed((current) => ({ ...current, [candidate.id]: state }))}
                />
              ))
            )}
          </div>
        </section>
      </section>

      <section className="preview-panel">
        <div className="panel-heading">
          <h2>Document preview</h2>
          <span>{previewStatus}</span>
        </div>
        <KeyFieldStrip fields={analysis.keyFields} activeFieldId={activeFieldId} onFieldClick={focusField} />
        <DocumentPreview
          pages={documentPages}
          ocrLines={ocrLines}
          text={text}
          fields={analysis.keyFields}
          activeFieldId={activeFieldId}
          fieldRefs={fieldRefs}
          onImageLoad={updatePageSize}
        />
      </section>
    </main>
  )
}

function KeyFieldStrip({
  fields,
  activeFieldId,
  onFieldClick,
}: {
  fields: KeyField[]
  activeFieldId: KeyField['id']
  onFieldClick: (field: KeyField) => void
}) {
  return (
    <div className="key-field-strip" aria-label="Key extracted fields">
      {fields.map((field) => (
        <button key={field.id} type="button" className={`key-field ${field.status} ${field.id === activeFieldId ? 'active' : ''}`} onClick={() => onFieldClick(field)}>
          <span>{field.label}</span>
          <strong>{field.value}</strong>
          <small>{field.confidence}% confidence</small>
        </button>
      ))}
    </div>
  )
}

function DocumentPreview({
  pages,
  ocrLines,
  text,
  fields,
  activeFieldId,
  fieldRefs,
  onImageLoad,
}: {
  pages: OcrPreviewPage[]
  ocrLines: OcrLine[]
  text: string
  fields: KeyField[]
  activeFieldId: KeyField['id']
  fieldRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  onImageLoad: (pageNumber: number, width: number, height: number) => void
}) {
  if (pages.length === 0) {
    return <TextPreview text={text} fields={fields} activeFieldId={activeFieldId} fieldRefs={fieldRefs} />
  }

  const linesByField = new Map(fields.map((field) => [field.id, field.lineNumber ? ocrLines[field.lineNumber - 1] : undefined]))

  return (
    <div className="image-preview-shell">
      {pages.map((page) => (
        <section key={page.id} className="document-page">
          <div className="document-page-heading">Page {page.pageNumber}</div>
          <div className="document-image-wrap">
            <img
              src={page.imageUrl}
              alt={`Document preview page ${page.pageNumber}`}
              onLoad={(event) => onImageLoad(page.pageNumber, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            />
            {page.width > 0 &&
              fields.map((field) => {
                const line = linesByField.get(field.id)
                if (field.status === 'not-found' || line?.pageNumber !== page.pageNumber) return null

                return (
                  <ImageMarker
                    key={`${page.id}-${field.id}`}
                    field={field}
                    line={line}
                    page={page}
                    active={field.id === activeFieldId}
                    setRef={(element) => {
                      fieldRefs.current[field.id] = element
                    }}
                  />
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}

function ImageMarker({
  field,
  line,
  page,
  active,
  setRef,
}: {
  field: KeyField
  line: OcrLine | undefined
  page: OcrPreviewPage
  active: boolean
  setRef: (element: HTMLDivElement | null) => void
}) {
  const fallbackIndex = field.id === 'vat-total' ? 0.62 : field.id === 'org-number' ? 0.5 : 0.33
  const box = line?.bbox
  const style = box
    ? {
        left: `${(box.x0 / page.width) * 100}%`,
        top: `${(box.y0 / page.height) * 100}%`,
        width: `${Math.max(((box.x1 - box.x0) / page.width) * 100, 14)}%`,
        height: `${Math.max(((box.y1 - box.y0) / page.height) * 100, 3)}%`,
      }
    : {
        left: '8%',
        top: `${fallbackIndex * 100}%`,
        width: '84%',
        height: '6%',
      }

  return (
    <div ref={setRef} className={`image-marker ${field.id} ${field.status} ${active ? 'active' : ''}`} style={style}>
      <span>{field.label}</span>
    </div>
  )
}

function TextPreview({
  text,
  fields,
  activeFieldId,
  fieldRefs,
}: {
  text: string
  fields: KeyField[]
  activeFieldId: KeyField['id']
  fieldRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
}) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const fieldsByLine = new Map<number, KeyField[]>()

  fields.forEach((field) => {
    if (!field.lineNumber) return
    fieldsByLine.set(field.lineNumber, [...(fieldsByLine.get(field.lineNumber) ?? []), field])
  })

  if (lines.length === 0) return <pre className="text-preview">No extracted text yet.</pre>

  return (
    <div className="text-preview">
      {lines.map((line, index) => {
        const lineFields = fieldsByLine.get(index + 1) ?? []
        const isActiveLine = lineFields.some((field) => field.id === activeFieldId)

        return (
          <div
            key={`${index}-${line}`}
            ref={(element) => {
              lineFields.forEach((field) => {
                fieldRefs.current[field.id] = element
              })
            }}
            className={`text-line ${lineFields.length > 0 ? 'marked' : ''} ${isActiveLine ? 'active' : ''}`}
          >
            <span className="text-line-number">{index + 1}</span>
            <span>{line}</span>
            {lineFields.map((field) => (
              <div key={field.id} className={`text-marker ${field.id} ${field.id === activeFieldId ? 'active' : ''}`}>
                {field.label}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function VatSummaryCard({ summary }: { summary: VatSummary }) {
  const title =
    summary.state === 'found'
      ? 'Total VAT/MVA due for document'
      : summary.state === 'needs-review'
        ? 'Total VAT/MVA needs review'
        : 'No document VAT/MVA detected'
  const status =
    summary.state === 'found'
      ? 'Validation status: detected'
      : summary.state === 'needs-review'
        ? 'Validation status: review required'
        : 'Validation status: not detected'

  return (
    <article className={`vat-summary-card ${summary.state}`}>
      <div className="vat-summary-head">
        <div>
          <span className="line-label">Document-level audit result</span>
          <h3>{title}</h3>
        </div>
        <div className="score">
          <strong>{summary.confidence}</strong>
          <span>confidence</span>
        </div>
      </div>

      <div className="vat-summary-amount">{summary.amount !== undefined ? formatNok(summary.amount) : '-'}</div>
      <div className="vat-summary-status">
        <strong>{status}</strong>
        <span>{summary.label}</span>
      </div>
      <pre className="snippet">{summary.evidence}</pre>

      {summary.candidates.length > 0 && (
        <ul className="summary-candidates">
          {summary.candidates.slice(0, 3).map((candidate) => (
            <li key={`${candidate.lineNumber}-${candidate.amount}-${candidate.confidence}`}>
              <strong>{formatNok(candidate.amount)}</strong>
              <span>
                {candidate.confidence} - {candidate.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`summary-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CandidateRow({
  candidate,
  state,
  onSetState,
}: {
  candidate: VatCandidate
  state?: 'confirmed' | 'corrected'
  onSetState: (state: 'confirmed' | 'corrected') => void
}) {
  return (
    <article className={`candidate ${candidate.status}`}>
      <div className="candidate-head">
        <div>
          <span className="line-label">Line {candidate.lineNumber}</span>
          <h3>{candidate.rate}% MVA candidate</h3>
        </div>
        <div className="score">
          <strong>{candidate.confidence}</strong>
          <span>{candidate.status}</span>
        </div>
      </div>

      <dl className="amount-grid">
        <div>
          <dt>VAT</dt>
          <dd>{formatNok(candidate.vatAmount)}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>{formatNok(candidate.netAmount)}</dd>
        </div>
        <div>
          <dt>Gross</dt>
          <dd>{formatNok(candidate.grossAmount)}</dd>
        </div>
      </dl>

      <ul className="check-list">
        {candidate.checks.map((check) => (
          <li key={check}>{check}</li>
        ))}
      </ul>

      <pre className="snippet">{candidate.snippet}</pre>

      <div className="actions">
        <button type="button" className={state === 'confirmed' ? 'active' : ''} onClick={() => onSetState('confirmed')}>
          Confirm
        </button>
        <button type="button" className={state === 'corrected' ? 'active' : ''} onClick={() => onSetState('corrected')}>
          Mark corrected
        </button>
      </div>
    </article>
  )
}

export default App
