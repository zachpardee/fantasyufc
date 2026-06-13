import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Force a single React copy — the monorepo root hoists React 19 for mobile,
  // while web stays on 18 in its local node_modules
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
