import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { rollupOptions: { input: 'index.html' } },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
