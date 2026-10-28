import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Due pagine: l'app e il modulo del preventivo che si apre dentro Telegram (mini app).
  build: { rolldownOptions: { input: { main: 'index.html', modulo: 'modulo.html' } } },
});
