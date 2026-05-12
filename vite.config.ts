/// <reference types="node" />

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// @ts-ignore
export default defineConfig({
  base: '/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
})