// Pagina del modulo "Compila preventivo", aperta dentro Telegram dal pulsante che manda il bot (mini app).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Modulo } from './Modulo';
import './modulo.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Modulo />
  </StrictMode>,
);
