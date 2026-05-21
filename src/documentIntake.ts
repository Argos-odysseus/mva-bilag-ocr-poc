export type SupportedDocumentKind = 'image' | 'pdf' | 'unsupported'

export function getSupportedDocumentKind(file: Pick<File, 'name' | 'type'>): SupportedDocumentKind {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf'

  return 'unsupported'
}

export function isSupportedDocumentFile(file: Pick<File, 'name' | 'type'>): boolean {
  return getSupportedDocumentKind(file) !== 'unsupported'
}

export function getUnsupportedDocumentMessage(file: Pick<File, 'name' | 'type'>): string {
  if (getSupportedDocumentKind(file) !== 'unsupported') return ''
  return `Unsupported file: ${file.name || 'unnamed file'}. Upload a PDF or an image receipt/invoice, or paste text into the editor.`
}

export function joinDocumentPageText(pages: Array<{ text: string }>): string {
  return pages
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join('\n\n')
}
