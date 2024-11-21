import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isElectron = process.env.ELECTRON === 'true';
const isDev = process.env.NODE_ENV === 'development';
const base = isElectron ? './' : '/';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base,
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    watch: isDev ? {} : null,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]'
      }
    },
    target: 'esnext',
    minify: isDev ? false : 'esbuild',
    sourcemap: isDev,
    emptyOutDir: true,
    cssCodeSplit: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000
  },
  server: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: ['electron']
  },
  esbuild: {
    platform: isElectron ? 'node' : 'browser',
    legalComments: 'none',
    treeShaking: true
  }
});
