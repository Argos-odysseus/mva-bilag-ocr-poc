export type VatRate = 0 | 12 | 15 | 25

export type MoneyHit = {
  amount: number
  raw: string
  label: 'vat' | 'gross' | 'net' | 'unknown'
  lineNumber: number
  line: string
}

export type VatCandidate = {
  id: string
  rate: VatRate
  vatAmount: number
  grossAmount?: number
  netAmount?: number
  sourceLabel: string
  snippet: string
  confidence: number
  status: 'pass' | 'review' | 'fail'
  checks: string[]
  lineNumber: number
}

export type VatSummary =
  | {
      state: 'found'
      amount: number
      confidence: number
      label: string
      evidence: string
      candidates: VatSummaryCandidate[]
    }
  | {
      state: 'needs-review' | 'not-found'
      amount?: number
      confidence: number
      label: string
      evidence: string
      candidates: VatSummaryCandidate[]
    }

export type VatSummaryCandidate = {
  amount: number
  confidence: number
  label: string
  evidence: string
  lineNumber: number
  reason: string
}

export type KeyFieldStatus = 'found' | 'needs-review' | 'not-found'

export type KeyField = {
  id: 'vat-total' | 'org-number' | 'recipient-address'
  label: string
  value: string
  status: KeyFieldStatus
  confidence: number
  evidence: string
  lineNumber?: number
}

const VAT_LABELS = ['mva', 'merverdiavgift', 'moms', 'vat', 'avgift']
const GROSS_LABELS = ['total', 'totalt', 'sum a betale', 'a betale', 'brutto', 'gross']
const NET_LABELS = ['netto', 'grunnlag', 'subtotal', 'eks mva', 'ex vat', 'net']
const MONEY_PATTERN = /(?:nok|kr)?\s*-?\d{1,3}(?:(?:[ .])\d{3})*(?:,\d{2})|(?:nok|kr)?\s*-?\d+(?:,\d{2})/gi
const ORG_NUMBER_PATTERN = /\b(?:org\.?\s*(?:nr|nummer)?\.?\s*)?(\d{3}\s?\d{3}\s?\d{3})(?:\s*MVA)?\b/i
const ADDRESS_HINTS = ['mottaker', 'kunde', 'faktura til', 'fakturert til', 'leveres til', 'adresse']
const ADDRESS_PATTERN = /\b[\p{L} -]*(?:gate|gaten|gata|veien|vegen|vei|veg|plass|plassen|stien|svingen|ringen|alle|allé|bakken|brygge|brygga|kaia|strand|terrasse)\b/iu
const POSTAL_PATTERN = /\b\d{4}\s+[A-ZÆØÅ][A-ZÆØÅ -]{2,}\b/i

export const SAMPLE_TEXT = `Faktura 1042
Leverandor: Nordlys Kontor AS
Org.nr. 913 456 789 MVA
Mottaker:
Skatteetaten, Postboks 9200 Gronland
0134 OSLO
Dato: 20.05.2026

Netto grunnlag 25%: kr 1 200,00
MVA 25%: kr 300,00
MVA-belop NOK 300,00
Totalt a betale: kr 1 500,00

Servering:
Netto 15%: 400,00
MVA 15%: 60,00
Total inkl. mva: 460,00`

export function parseMoney(raw: string): number | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/nok|kr/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const amount = Number.parseFloat(cleaned)
  return Number.isFinite(amount) ? amount : null
}

export function formatNok(amount: number | undefined): string {
  if (amount === undefined || Number.isNaN(amount)) return '-'
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function analyzeVatText(text: string): {
  candidates: VatCandidate[]
  moneyHits: MoneyHit[]
  vatSummary: VatSummary
  keyFields: KeyField[]
  summary: { pass: number; review: number; fail: number }
} {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const moneyHits = lines.flatMap((line, index) => findMoneyHits(line, index + 1))
  const candidates = buildCandidates(lines, moneyHits)
    .sort((a, b) => b.confidence - a.confidence)
    .map((candidate, index) => ({ ...candidate, id: `mva-${index + 1}` }))
  const vatSummary = summarizeVat(lines, moneyHits, candidates)

  return {
    candidates,
    moneyHits,
    vatSummary,
    keyFields: buildKeyFields(lines, vatSummary),
    summary: {
      pass: candidates.filter((candidate) => candidate.status === 'pass').length,
      review: candidates.filter((candidate) => candidate.status === 'review').length,
      fail: candidates.filter((candidate) => candidate.status === 'fail').length,
    },
  }
}

function buildKeyFields(lines: string[], vatSummary: VatSummary): KeyField[] {
  return [fieldFromVatSummary(vatSummary), findOrgNumber(lines), findRecipientAddress(lines)]
}

function fieldFromVatSummary(summary: VatSummary): KeyField {
  if (summary.state === 'found' && summary.amount !== undefined) {
    return {
      id: 'vat-total',
      label: 'Total MVA',
      value: formatNok(summary.amount),
      status: 'found',
      confidence: summary.confidence,
      evidence: summary.evidence,
      lineNumber: summary.candidates[0]?.lineNumber,
    }
  }

  return {
    id: 'vat-total',
    label: 'Total MVA',
    value: summary.amount !== undefined ? formatNok(summary.amount) : '-',
    status: summary.state,
    confidence: summary.confidence,
    evidence: summary.evidence,
    lineNumber: summary.candidates[0]?.lineNumber,
  }
}

function findOrgNumber(lines: string[]): KeyField {
  for (const [index, line] of lines.entries()) {
    const match = line.match(ORG_NUMBER_PATTERN)
    if (!match) continue

    const value = match[1].replace(/\s/g, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')
    const normalized = normalize(line)
    return {
      id: 'org-number',
      label: 'Orgnummer',
      value,
      status: 'found',
      confidence: normalized.includes('org') ? 94 : 78,
      evidence: line,
      lineNumber: index + 1,
    }
  }

  return {
    id: 'org-number',
    label: 'Orgnummer',
    value: '-',
    status: 'not-found',
    confidence: 0,
    evidence: 'No Norwegian organisation number pattern was detected.',
  }
}

function findRecipientAddress(lines: string[]): KeyField {
  const labelled = findLabelledAddress(lines)
  if (labelled) return labelled

  const inferred = inferAddressBlock(lines)
  if (inferred) return inferred

  return {
    id: 'recipient-address',
    label: 'Mottakeradresse',
    value: '-',
    status: 'not-found',
    confidence: 0,
    evidence: 'No recipient address block was detected.',
  }
}

function findLabelledAddress(lines: string[]): KeyField | undefined {
  for (const [index, line] of lines.entries()) {
    const normalized = normalize(line)
    if (!ADDRESS_HINTS.some((hint) => normalized.includes(normalize(hint)))) continue

    const sameLineValue = line.split(':').slice(1).join(':').trim()
    const nextLines = lines.slice(index + 1, index + 4).filter(isLikelyAddressLine)
    const valueLines = [sameLineValue, ...nextLines].filter(Boolean)
    if (valueLines.length === 0) continue

    return {
      id: 'recipient-address',
      label: 'Mottakeradresse',
      value: valueLines.join(', '),
      status: 'found',
      confidence: sameLineValue || nextLines.length >= 2 ? 88 : 76,
      evidence: [line, ...nextLines].join('\n'),
      lineNumber: sameLineValue ? index + 1 : index + 2,
    }
  }

  return undefined
}

function inferAddressBlock(lines: string[]): KeyField | undefined {
  const postalIndex = lines.findIndex((line) => POSTAL_PATTERN.test(line))
  if (postalIndex === -1) return undefined

  const start = Math.max(0, postalIndex - 2)
  const block = lines.slice(start, postalIndex + 1).filter((line) => isLikelyAddressLine(line) || POSTAL_PATTERN.test(line))
  if (block.length < 2) return undefined

  return {
    id: 'recipient-address',
    label: 'Mottakeradresse',
    value: block.join(', '),
    status: 'found',
    confidence: block.some((line) => ADDRESS_PATTERN.test(line)) ? 82 : 68,
    evidence: block.join('\n'),
    lineNumber: start + 1,
  }
}

function isLikelyAddressLine(line: string): boolean {
  const normalized = normalize(line)
  return ADDRESS_PATTERN.test(line) || POSTAL_PATTERN.test(line) || /\bpostboks\b/.test(normalized) || /\b(?:c\/o|v\/)\b/.test(normalized)
}

function summarizeVat(lines: string[], moneyHits: MoneyHit[], candidates: VatCandidate[]): VatSummary {
  const summaryCandidates = [
    ...directVatSummaryCandidates(lines, moneyHits),
    ...candidates.map((candidate) => ({
      amount: candidate.vatAmount,
      confidence: Math.min(candidate.confidence + (candidate.status === 'pass' ? 5 : 0), 96),
      label: `${candidate.rate}% MVA candidate`,
      evidence: candidate.snippet,
      lineNumber: candidate.lineNumber,
      reason: candidate.status === 'pass' ? 'formula validated candidate' : 'candidate line requires review',
    })),
  ]
    .filter((candidate) => candidate.amount >= 0)
    .sort((a, b) => b.confidence - a.confidence || b.amount - a.amount)

  const deduped = dedupeSummaryCandidates(summaryCandidates)
  const best = deduped[0]

  if (best && best.confidence >= 76) {
    return {
      state: 'found',
      amount: best.amount,
      confidence: best.confidence,
      label: best.label,
      evidence: best.evidence,
      candidates: deduped.slice(0, 5),
    }
  }

  if (best) {
    return {
      state: 'needs-review',
      amount: best.amount,
      confidence: best.confidence,
      label: 'MVA needs review',
      evidence: best.evidence,
      candidates: deduped.slice(0, 5),
    }
  }

  const hasVatText = lines.some((line) => hasVatLabel(normalize(line)))
  const hasMoney = moneyHits.length > 0

  return {
    state: hasVatText || hasMoney ? 'needs-review' : 'not-found',
    confidence: 0,
    label: hasVatText ? 'MVA label found without amount' : 'No MVA detected',
    evidence: hasVatText
      ? 'OCR text mentions MVA/VAT but no usable amount was parsed.'
      : 'No MVA/VAT label was detected in the extracted text.',
    candidates: [],
  }
}

function directVatSummaryCandidates(lines: string[], moneyHits: MoneyHit[]): VatSummaryCandidate[] {
  const candidates: VatSummaryCandidate[] = []

  lines.forEach((line, index) => {
    const lower = normalize(line)
    if (!hasVatLabel(lower)) return
    if (isNetExVatLine(lower)) return

    const amounts = moneyHits.filter((hit) => hit.lineNumber === index + 1)
    if (amounts.length === 0) return

    const rates = extractRates(line)
    const usableAmounts = amounts.filter((hit) => !rates.includes(hit.amount as VatRate))
    const lineCandidates = usableAmounts.length > 0 ? usableAmounts : amounts

    for (const hit of lineCandidates) {
      const score = directVatConfidence(lower, lineCandidates.length)
      candidates.push({
        amount: hit.amount,
        confidence: score.confidence,
        label: score.label,
        evidence: snippetAround(lines, index),
        lineNumber: index + 1,
        reason: score.reason,
      })
    }
  })

  return candidates
}

function directVatConfidence(
  normalizedLine: string,
  amountCount: number,
): { confidence: number; label: string; reason: string } {
  const explicitTotalVat =
    /\b(?:mva|vat|moms|merverdiavgift|avgift)\s*[- ]?\s*(?:belop|amount|totalt?|sum)\b/.test(normalizedLine) ||
    /\b(?:sum|total(?:t)?|herav)\s+(?:mva|vat|moms|merverdiavgift|avgift)\b/.test(normalizedLine) ||
    /\b(?:mva|vat|moms|merverdiavgift|avgift)\s*:\s*/.test(normalizedLine)
  const hasRate = /\b(?:25|15|12|0)\s*%/.test(normalizedLine)
  const includesVat = /\binkl\.?\s*(?:mva|vat|moms)\b/.test(normalizedLine)
  const grossish = /\b(?:total(?:t)?|sum a betale|a betale|brutto)\b/.test(normalizedLine)

  if (explicitTotalVat && !grossish) {
    return {
      confidence: hasRate ? 92 : 88,
      label: 'Total MVA',
      reason: 'explicit VAT amount label',
    }
  }

  if (/\bherav\s+(?:mva|vat|moms)\b/.test(normalizedLine)) {
    return {
      confidence: 91,
      label: 'Total MVA',
      reason: 'included VAT amount label',
    }
  }

  if (hasRate && hasVatLabel(normalizedLine)) {
    return {
      confidence: amountCount === 1 ? 84 : 74,
      label: 'MVA rate line',
      reason: 'VAT label and rate on same line',
    }
  }

  if (includesVat && !grossish) {
    return {
      confidence: 72,
      label: 'MVA needs review',
      reason: 'included VAT label without clear total wording',
    }
  }

  return {
    confidence: grossish ? 42 : 64,
    label: grossish ? 'MVA needs review' : 'Possible MVA',
    reason: grossish ? 'line may be gross total including VAT' : 'VAT label near amount',
  }
}

function dedupeSummaryCandidates(candidates: VatSummaryCandidate[]): VatSummaryCandidate[] {
  const byKey = new Map<string, VatSummaryCandidate>()
  for (const candidate of candidates) {
    const key = `${candidate.amount.toFixed(2)}-${candidate.lineNumber}`
    const existing = byKey.get(key)
    if (!existing || candidate.confidence > existing.confidence) byKey.set(key, candidate)
  }
  return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence || b.amount - a.amount)
}

function buildCandidates(lines: string[], moneyHits: MoneyHit[]): Omit<VatCandidate, 'id'>[] {
  const candidates: Omit<VatCandidate, 'id'>[] = []

  lines.forEach((line, index) => {
    const lower = normalize(line)
    const hasVatLabel = VAT_LABELS.some((label) => lower.includes(label))
    const rates = extractRates(line)
    const amounts = moneyHits.filter((hit) => hit.lineNumber === index + 1)

    if (!hasVatLabel && rates.length === 0) return
    if (isNetExVatLine(lower)) return
    const lineRates = rates.length > 0 ? rates : inferRatesNear(lines, index)
    const vatAmounts = amounts.filter((hit) => hit.label === 'vat' || hasVatLabel)

    for (const rate of lineRates) {
      for (const hit of vatAmounts) {
        if (hit.amount === rate && !hit.raw.includes(',')) continue
        candidates.push(validateCandidate(hit.amount, rate, index, lines, moneyHits, hasVatLabel ? 'VAT label' : 'rate line'))
      }
    }
  })

  return dedupeCandidates(candidates)
}

function validateCandidate(
  vatAmount: number,
  rate: VatRate,
  lineIndex: number,
  lines: string[],
  moneyHits: MoneyHit[],
  sourceLabel: string,
): Omit<VatCandidate, 'id'> {
  const nearby = moneyHits.filter((hit) => Math.abs(hit.lineNumber - (lineIndex + 1)) <= 4)
  const grossHit = bestNearbyHit(nearby, 'gross')
  const netHit = bestNearbyHit(nearby, 'net')
  const derivedNet = rate === 0 ? undefined : roundMoney(vatAmount / (rate / 100))
  const derivedGross = derivedNet === undefined ? undefined : roundMoney(derivedNet + vatAmount)
  const checks: string[] = []
  let confidence = 48

  if (rate === 0) {
    const ok = Math.abs(vatAmount) < 0.01
    checks.push(ok ? '0% VAT line has zero VAT amount' : '0% VAT line should normally have zero VAT amount')
    confidence = ok ? 78 : 35
  } else {
    checks.push(`Expected net ${formatNok(derivedNet)} and gross ${formatNok(derivedGross)} from ${rate}% VAT`)
    confidence += 12
  }

  if (netHit && derivedNet !== undefined) {
    const delta = Math.abs(netHit.amount - derivedNet)
    checks.push(delta <= 0.05 ? `Net amount matches ${formatNok(netHit.amount)}` : `Net amount differs: found ${formatNok(netHit.amount)}`)
    confidence += delta <= 0.05 ? 16 : -18
  }

  if (grossHit && derivedGross !== undefined) {
    const delta = Math.abs(grossHit.amount - derivedGross)
    checks.push(delta <= 0.05 ? `Gross amount matches ${formatNok(grossHit.amount)}` : `Gross amount differs: found ${formatNok(grossHit.amount)}`)
    confidence += delta <= 0.05 ? 18 : -22
  }

  if (!grossHit && !netHit && rate !== 0) {
    checks.push('No nearby net or gross amount found for formula validation')
  }

  const status = confidence >= 78 ? 'pass' : confidence >= 50 ? 'review' : 'fail'
  return {
    rate,
    vatAmount,
    grossAmount: grossHit?.amount ?? derivedGross,
    netAmount: netHit?.amount ?? derivedNet,
    sourceLabel,
    snippet: snippetAround(lines, lineIndex),
    confidence: clamp(confidence, 0, 99),
    status,
    checks,
    lineNumber: lineIndex + 1,
  }
}

function findMoneyHits(line: string, lineNumber: number): MoneyHit[] {
  const lower = normalize(line)
  const label = labelForLine(lower)
  return Array.from(line.matchAll(new RegExp(MONEY_PATTERN)))
    .map((match) => ({ raw: match[0], amount: parseMoney(match[0]) }))
    .filter((match): match is { raw: string; amount: number } => match.amount !== null)
    .filter((match) => ![0, 12, 15, 25].includes(match.amount) || /(?:nok|kr|,)/i.test(match.raw))
    .map((match) => ({ amount: match.amount, raw: match.raw, label, lineNumber, line }))
}

function labelForLine(lower: string): MoneyHit['label'] {
  if (isNetExVatLine(lower)) return 'net'
  if (hasVatLabel(lower)) return 'vat'
  if (GROSS_LABELS.some((label) => lower.includes(label))) return 'gross'
  if (NET_LABELS.some((label) => lower.includes(label))) return 'net'
  return 'unknown'
}

function hasVatLabel(lower: string): boolean {
  return VAT_LABELS.some((label) => lower.includes(label)) || /\bmva\s*[- ]?\s*belop\b/.test(lower)
}

function isNetExVatLine(lower: string): boolean {
  return /\b(?:eks|ex|uten)\.?\s*(?:mva|vat|moms)\b/.test(lower) || /\b(?:netto|grunnlag|subtotal)\b/.test(lower)
}

function bestNearbyHit(hits: MoneyHit[], label: MoneyHit['label']): MoneyHit | undefined {
  return hits.filter((hit) => hit.label === label).sort((a, b) => b.amount - a.amount)[0]
}

function inferRatesNear(lines: string[], lineIndex: number): VatRate[] {
  const window = lines.slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 3)).join(' ')
  const rates = extractRates(window)
  return rates.length > 0 ? Array.from(new Set(rates)) : [25]
}

function dedupeCandidates(candidates: Omit<VatCandidate, 'id'>[]): Omit<VatCandidate, 'id'>[] {
  const byKey = new Map<string, Omit<VatCandidate, 'id'>>()
  for (const candidate of candidates) {
    const key = `${candidate.rate}-${candidate.vatAmount.toFixed(2)}-${candidate.lineNumber}`
    const existing = byKey.get(key)
    if (!existing || candidate.confidence > existing.confidence) byKey.set(key, candidate)
  }
  return Array.from(byKey.values())
}

function extractRates(value: string): VatRate[] {
  const matches = Array.from(value.matchAll(/(?<![\d.,])(?:25|15|12|0)(?:[.,]0+)?\s*%/g))
  return matches.map((match) => Number.parseInt(match[0], 10) as VatRate)
}

function snippetAround(lines: string[], lineIndex: number): string {
  return lines.slice(Math.max(0, lineIndex - 1), Math.min(lines.length, lineIndex + 2)).join('\n')
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/å/g, 'a').replace(/ø/g, 'o').replace(/æ/g, 'ae')
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
