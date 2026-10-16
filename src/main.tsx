import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initCloud } from './store/remote';
import './styles.css';

initCloud();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
