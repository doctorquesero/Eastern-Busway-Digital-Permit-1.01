import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/cxR': {
        // Usamos la URL base confirmada por GetUrl
        target: 'https://au.itwocx.com/api/25.12', 
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/cxR/, ''),
        headers: {
          'Origin': 'https://au.itwocx.com',
          'Referer': 'https://au.itwocx.com/api/25.12/',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    }
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});