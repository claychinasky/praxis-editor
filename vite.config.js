import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isElectron = process.env.ELECTRON === 'true';
const isDev = process.env.NODE_ENV === 'development';
const base = './';  // Always use relative paths for Electron

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
    assetsDir: '',  // Place assets in root of dist
    watch: isDev ? {} : null,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
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
    keepNames: true
  }
});
