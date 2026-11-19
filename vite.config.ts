import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages project site lives at /amma-radio/. When a custom domain
// (radio.<domain>) is connected, set the repo variable PAGES_BASE to "/".
const base = process.env.VITE_BASE || '/amma-radio/';

export default defineConfig({
  base,
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
