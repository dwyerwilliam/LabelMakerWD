import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@main': path.resolve(import.meta.dirname, 'src/main'),
      '@preload': path.resolve(import.meta.dirname, 'src/preload'),
      '@renderer': path.resolve(import.meta.dirname, 'src/renderer'),
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
  },
});
