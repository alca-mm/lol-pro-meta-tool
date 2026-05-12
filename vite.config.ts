/// <reference types="node" />

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// @ts-ignore
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/lol-pro-meta-tool/' : '/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
})