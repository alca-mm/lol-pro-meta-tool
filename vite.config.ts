/// <reference types="node" />
// @ts-nocheck

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { normalizeBasePath } from './src/lib/normalizeBasePath'

// Base path for the build. Defaults to '/' (local dev / custom or root domain).
// CI sets VITE_BASE_PATH (e.g. '/lol-pro-meta-tool/') for the GitHub Pages project site.
// Normalize so the value always starts and ends with a single '/'.
const base = normalizeBasePath(process.env.VITE_BASE_PATH)

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
  },
})