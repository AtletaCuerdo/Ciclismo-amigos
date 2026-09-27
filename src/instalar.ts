/**
 * «Instalar RideCrew»: Chrome y Edge (PC, Mac, Android) permiten instalar la web como una
 * aplicación, con acceso directo en el escritorio y su propia ventana. El navegador avisa con
 * el evento `beforeinstallprompt`; se guarda para lanzar el diálogo desde un botón.
 * En iPhone/iPad no existe: allí se añade con «Compartir → Añadir a pantalla de inicio».
 */
import { useEffect, useState } from 'react';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pendiente: EventoInstalar | null = null;
const avisos = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // sin la barra automática: se usa el botón de la web
    pendiente = e as EventoInstalar;
    avisos.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    pendiente = null;
    avisos.forEach((f) => f());
  });
}

/** true si la web ya se está usando instalada (ventana propia). */
export const enModoApp = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** Si se puede instalar ahora y la función que abre el diálogo del navegador. */
export function useInstalar() {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const f = () => refrescar((n) => n + 1);
    avisos.add(f);
    return () => {
      avisos.delete(f);
    };
  }, []);
  const instalar = async () => {
    const e = pendiente;
    if (!e) return;
    await e.prompt();
    await e.userChoice;
    pendiente = null;
    avisos.forEach((f) => f());
  };
  return { disponible: pendiente !== null && !enModoApp(), instalar };
}
