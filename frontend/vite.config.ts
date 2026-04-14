import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/predict': 'http://127.0.0.1:8000',
      '/city-state': 'http://127.0.0.1:8000',
      '/simulate': 'http://127.0.0.1:8000',
      '/forecast': 'http://127.0.0.1:8000',
      '/energy-flow': 'http://127.0.0.1:8000',
      '/recommendations': 'http://127.0.0.1:8000',
      '/ai-query': 'http://127.0.0.1:8000',
    },
  },
});
