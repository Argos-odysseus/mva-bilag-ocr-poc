import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/mva-bilag-ocr-poc/',
  plugins: [react()],
})
