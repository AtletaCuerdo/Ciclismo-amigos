/**
 * Guardado automático de la sesión en marcha (en el navegador).
 *
 * Si el sistema cierra la web a mitad de entreno (una notificación, cambiar de app, el iPad
 * sin memoria…), al volver se ofrece retomarla donde se quedó en lugar de perderlo todo.
 */
import type { Entrenamiento } from '../entrenamientos/tipos';
import type { Interno } from './useGrabacion';

const CLAVE = 'rodillos.sesionEnCurso';
/** Pasado este tiempo sin tocarla ya no se ofrece retomarla. */
const CADUCA_MS = 12 * 3600 * 1000;

/** Lo de la sesión que solo sirve para los logros (pasa al resumen al terminar). */
export interface SesionLogros {
  completados: string[];
  vueltas: Record<string, number>;
  records: number;
  maxGrupo: number;
}

export const sesionLogrosVacia = (): SesionLogros => ({ completados: [], vueltas: {}, records: 0, maxGrupo: 0 });

export interface SesionEnCurso {
  guardada: number; // ms
  grabacion: Interno;
  circuito: string;
  /** Punto del circuito respecto a lo grabado (m). */
  adelanto: number;
  cortes: number[];
  cambiosCircuito: [number, string][];
  nombres: string[];
  companeros: string[];
  segundosRueda: number;
  logros?: SesionLogros;
  /** Entrenamiento guiado en marcha (y el segundo de la grabación en que empezó). */
  entreno?: { entreno: Entrenamiento; inicioS: number; intensidad: number };
}

export function guardarSesionEnCurso(s: SesionEnCurso) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(s));
  } catch {
    // Sin espacio o sin permiso: no se puede guardar, se sigue igual
  }
}

export function leerSesionEnCurso(): SesionEnCurso | null {
  try {
    const t = localStorage.getItem(CLAVE);
    if (!t) return null;
    const s = JSON.parse(t) as SesionEnCurso;
    if (!s?.grabacion?.muestras?.length || Date.now() - s.guardada > CADUCA_MS) {
      borrarSesionEnCurso();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function borrarSesionEnCurso() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // nada
  }
}
