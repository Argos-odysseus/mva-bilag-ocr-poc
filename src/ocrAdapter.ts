import { createWorker } from 'tesseract.js'

export type OcrProgress = {
  status: string
  progress: number
}

export async function recognizeImage(file: File, onProgress: (progress: OcrProgress) => void): Promise<string> {
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
    return result.data.text
  } finally {
    await worker.terminate()
  }
}
