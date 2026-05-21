import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker } from 'tesseract.js'
import { getSupportedDocumentKind, joinDocumentPageText } from './documentIntake'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const OCR_ASSET_BASE = `${import.meta.env.BASE_URL}ocr`
const TESSERACT_WORKER_PATH = `${OCR_ASSET_BASE}/worker.min.js`
const TESSERACT_CORE_PATH = `${OCR_ASSET_BASE}/tesseract-core`
const TESSDATA_PATH = `${OCR_ASSET_BASE}/tessdata/4.0.0`
const PDF_RENDER_SCALE = 2

export type OcrProgress = {
  status: string
  progress: number
  currentPage?: number
  totalPages?: number
}

export type OcrLine = {
  text: string
  confidence: number
  pageNumber: number
  bbox: {
    x0: number
    y0: number
    x1: number
    y1: number
  }
}

export type OcrPreviewPage = {
  id: string
  pageNumber: number
  imageUrl: string
  width: number
  height: number
  label: string
  revokeUrl?: boolean
}

export type OcrResult = {
  text: string
  lines: OcrLine[]
  pages: OcrPreviewPage[]
  pageCount: number
}

type RecognizedPage = {
  pageNumber: number
  text: string
  lines: OcrLine[]
  preview: OcrPreviewPage
}

export async function recognizeDocument(file: File, onProgress: (progress: OcrProgress) => void): Promise<OcrResult> {
  const kind = getSupportedDocumentKind(file)

  if (kind === 'unsupported') {
    throw new Error('Upload a PDF or an image receipt/invoice, or paste text into the text panel.')
  }

  const pageState = { currentPage: 1, totalPages: 1 }
  const worker = await createWorker('nor+eng', 1, {
    workerPath: TESSERACT_WORKER_PATH,
    corePath: TESSERACT_CORE_PATH,
    langPath: TESSDATA_PATH,
    logger: (message) => {
      if ('status' in message && 'progress' in message) {
        const currentPage = pageState.currentPage
        const totalPages = pageState.totalPages
        const progress = Math.min(((currentPage - 1) + Number(message.progress)) / totalPages, 1)
        onProgress({
          status: formatProgressStatus(String(message.status), currentPage, totalPages),
          progress,
          currentPage,
          totalPages,
        })
      }
    },
  })

  try {
    if (kind === 'pdf') {
      return await recognizePdf(file, worker, onProgress, pageState)
    }

    pageState.currentPage = 1
    pageState.totalPages = 1
    onProgress({ status: 'Running OCR on image', progress: 0, currentPage: 1, totalPages: 1 })

    const result = await worker.recognize(file)
    return {
      text: result.data.text.trim(),
      lines: extractOcrLines(result.data.blocks ?? [], 1),
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          imageUrl: URL.createObjectURL(file),
          width: 0,
          height: 0,
          label: file.name,
          revokeUrl: true,
        },
      ],
      pageCount: 1,
    }
  } finally {
    await worker.terminate()
  }
}

async function recognizePdf(
  file: File,
  worker: Awaited<ReturnType<typeof createWorker>>,
  onProgress: (progress: OcrProgress) => void,
  pageState: { currentPage: number; totalPages: number },
): Promise<OcrResult> {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: buffer }).promise
  const pages: RecognizedPage[] = []

  pageState.totalPages = pdf.numPages

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      pageState.currentPage = pageNumber
      onProgress({
        status: `Rendering PDF page ${pageNumber}/${pdf.numPages}`,
        progress: (pageNumber - 1) / pdf.numPages,
        currentPage: pageNumber,
        totalPages: pdf.numPages,
      })

      const renderedPage = await renderPdfPage(pdf, pageNumber, file.name)
      const result = await worker.recognize(renderedPage.canvas)

      pages.push({
        pageNumber,
        text: result.data.text,
        lines: extractOcrLines(result.data.blocks ?? [], pageNumber),
        preview: {
          id: `page-${pageNumber}`,
          pageNumber,
          imageUrl: renderedPage.imageUrl,
          width: renderedPage.width,
          height: renderedPage.height,
          label: `${file.name} - page ${pageNumber}`,
        },
      })
    }
  } finally {
    await pdf.destroy()
  }

  return {
    text: joinDocumentPageText(pages).trim(),
    lines: pages.flatMap((page) => page.lines),
    pages: pages.map((page) => page.preview),
    pageCount: pages.length,
  }
}

async function renderPdfPage(
  pdf: Awaited<ReturnType<typeof getDocument>> extends { promise: Promise<infer T> } ? T : never,
  pageNumber: number,
  fileName: string,
) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) {
    throw new Error('Canvas rendering is unavailable in this browser.')
  }

  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise

  page.cleanup()

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    imageUrl: canvas.toDataURL('image/png'),
    label: `${fileName} - page ${pageNumber}`,
  }
}

function extractOcrLines(blocks: Array<{ paragraphs: Array<{ lines: Array<{ text: string; confidence: number; bbox: OcrLine['bbox'] }> }> }>, pageNumber: number): OcrLine[] {
  return blocks.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines
        .map((line) => ({
          text: line.text.trim(),
          confidence: line.confidence,
          pageNumber,
          bbox: line.bbox,
        }))
        .filter((line) => line.text.length > 0),
    ),
  )
}

function formatProgressStatus(status: string, currentPage: number, totalPages: number): string {
  return totalPages > 1 ? `${status} (page ${currentPage}/${totalPages})` : status
}
