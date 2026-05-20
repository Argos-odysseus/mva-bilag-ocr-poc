import { useMemo, useState } from 'react'
import './App.css'
import { recognizeImage, type OcrProgress } from './ocrAdapter'
import { analyzeVatText, formatNok, SAMPLE_TEXT, type VatCandidate } from './vatAnalyzer'

type ConfirmedState = Record<string, 'confirmed' | 'corrected'>

function App() {
  const [text, setText] = useState(SAMPLE_TEXT)
  const [fileName, setFileName] = useState('Embedded sample')
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null)
  const [ocrError, setOcrError] = useState('')
  const [confirmed, setConfirmed] = useState<ConfirmedState>({})
  const analysis = useMemo(() => analyzeVatText(text), [text])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setOcrError('')
    setOcrProgress({ status: 'starting OCR', progress: 0 })

    try {
      const result = await recognizeImage(file, setOcrProgress)
      setText(result.trim() || '')
      setConfirmed({})
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'OCR failed')
    } finally {
      setOcrProgress(null)
    }
  }

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
            <button type="button" onClick={() => setText(SAMPLE_TEXT)}>
              Load sample
            </button>
          </div>

          <label className="dropzone">
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <span>Upload image/PDF</span>
            <small>{fileName}</small>
          </label>

          {ocrProgress && (
            <div className="progress">
              <div>
                <span>{ocrProgress.status}</span>
                <span>{Math.round(ocrProgress.progress * 100)}%</span>
              </div>
              <progress value={ocrProgress.progress} max={1} />
            </div>
          )}
          {ocrError && <p className="error">{ocrError}</p>}

          <label className="text-editor">
            OCR or pasted text
            <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          </label>
        </aside>

        <section className="results-panel">
          <div className="panel-heading">
            <h2>VAT candidates</h2>
            <span>{analysis.candidates.length} candidate lines</span>
          </div>

          <div className="candidate-list">
            {analysis.candidates.length === 0 ? (
              <div className="empty-state">No MVA/VAT candidates found. Paste invoice text or upload a clearer image.</div>
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
          <h2>Extracted text preview</h2>
          <span>{analysis.moneyHits.length} money amounts found</span>
        </div>
        <pre>{text || 'No extracted text yet.'}</pre>
      </section>
    </main>
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
