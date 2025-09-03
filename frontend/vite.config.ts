import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-chartjs-2': '/src/shims/react-chartjs-2.ts',
      'chart.js/auto': '/src/shims/chartjs.ts',
      'chart.js': '/src/shims/chartjs.ts',
    }
  },
  server: {
    port: 5173
  }
});
