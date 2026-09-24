import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Web Bluetooth solo funciona en contexto seguro (https o localhost).
// `npm run dev:https` arranca con un certificado autofirmado para poder
// probar desde el iPad (Bluefy) apuntando a la IP del ordenador.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: {
    host: true, // escucha en todas las interfaces (necesario en Replit y en red local)
    allowedHosts: true, // permite dominios externos como *.replit.dev
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
}));
