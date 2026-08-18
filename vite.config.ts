/// <reference types="node" />
// @ts-nocheck

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { normalizeBasePath } from './src/lib/normalizeBasePath.ts'

// The build targets the custom domain https://aatroxtool.de/ at the root,
// so `base` is '/'.
// CI deliberately does NOT set VITE_BASE_PATH - the default '/' is intended.
// VITE_BASE_PATH would only be needed for a GitHub Pages *project* site served
// from a repo subdirectory ('/<repo-name>/'). It must not be set while the
// custom domain is served from the root: it would rewrite every asset URL to
// '/<repo-name>/assets/...' and break the live site.
// normalizeBasePath guarantees the value always starts and ends with exactly
// one '/' (never '//').
const base = normalizeBasePath(process.env.VITE_BASE_PATH)

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
  },
})