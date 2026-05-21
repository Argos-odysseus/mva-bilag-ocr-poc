import { createWorker } from 'tesseract.js'

export type OcrProgress = {
  status: string
  progress: number
}

export type OcrLine = {
  text: string
  confidence: number
  bbox: {
    x0: number
    y0: number
    x1: number
    y1: number
  }
}

export type OcrResult = {
  text: string
  lines: OcrLine[]
}

export async function recognizeImage(file: File, onProgress: (progress: OcrProgress) => void): Promise<OcrResult> {
  if (file.type === 'application/pdf') {
    throw new Error('PDF OCR is not enabled in this browser POC. Paste extracted text or upload an image.')
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Upload a receipt or invoice image, or paste text into the text panel.')
  }

  const worker = await createWorker('nor+eng', 1, {
    logger: (message) => {
      if ('status' in message && 'progress' in message) {
        onProgress({ status: String(message.status), progress: Number(message.progress) })
      }
    },
  })

  try {
    const result = await worker.recognize(file)
    const lines =
      result.data.blocks?.flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines
            .map((line) => ({
              text: line.text.trim(),
              confidence: line.confidence,
              bbox: line.bbox,
            }))
            .filter((line) => line.text.length > 0),
        ),
      ) ?? []

    return {
      text: result.data.text,
      lines,
    }
  } finally {
    await worker.terminate()
  }
}
