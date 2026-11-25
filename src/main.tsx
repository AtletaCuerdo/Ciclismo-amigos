import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ProteccionErrores } from './components/ProteccionErrores';
import './estilos.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProteccionErrores>
      <App />
    </ProteccionErrores>
  </StrictMode>,
);
