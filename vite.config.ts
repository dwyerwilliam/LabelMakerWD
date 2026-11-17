import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

const alias = {
  '@': path.resolve(__dirname, 'src'),
  '@main': path.resolve(__dirname, 'src/main'),
  '@preload': path.resolve(__dirname, 'src/preload'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
  '@shared': path.resolve(__dirname, 'src/shared'),
};

function devServerWithoutContentSecurityPolicy(): Plugin {
  return {
    name: 'dev-server-without-content-security-policy',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\r?\n?/, ''),
    },
  };
}

// Browser-only UI tests need just the renderer served by Vite, not an Electron window.
const rendererOnly = process.env.LABELMAKER_NO_ELECTRON === '1';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 15174,
    strictPort: true,
  },
  resolve: {
    alias,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        print: path.resolve(__dirname, 'print.html'),
      },
    },
  },
  plugins: [
    devServerWithoutContentSecurityPolicy(),
    react(),
    ...(rendererOnly ? [] : [electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          resolve: { alias },
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        onstart: (startup) => {
          startup.reload();
        },
        vite: {
          resolve: { alias },
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              input: path.resolve(__dirname, 'src/preload/index.ts'),
              external: ['electron'],
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                entryFileNames: 'index.cjs',
              },
            },
          },
        },
      },
      {
        vite: {
          resolve: { alias },
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              input: path.resolve(__dirname, 'src/preload/print.ts'),
              external: ['electron'],
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                entryFileNames: 'print.cjs',
              },
            },
          },
        },
      },
    ]),
    renderer()]),
  ],
  clearScreen: false,
});
