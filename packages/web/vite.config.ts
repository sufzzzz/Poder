import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@enso/pair': here('../pair/src/index.ts'),
      '@shared': here('../../src/shared')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler/')) {
              return 'vendor-react';
            }
            if (
              id.includes('react-markdown') ||
              id.includes('remark-gfm') ||
              id.includes('micromark') ||
              id.includes('mdast') ||
              id.includes('unist') ||
              id.includes('vfile') ||
              id.includes('hast')
            ) {
              return 'vendor-markdown';
            }
          }
        }
      }
    }
  }
});