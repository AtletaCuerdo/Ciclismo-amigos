/**
 * Lo poco de los niveles que necesitan la salida en grupo y la escena 3D (sin cargar el cálculo
 * de los logros): mi nivel guardado y el nombre con el nivel al lado.
 */
export const NIVEL_MAX = 100;

// Mi nivel, guardado al calcularlo en el inicio, para enseñarlo en la salida en grupo
const CLAVE = 'rodillos.nivel';

export function guardarMiNivel(n: number) {
  try {
    localStorage.setItem(CLAVE, String(n));
  } catch {
    // sin almacenamiento: no se enseña el nivel
  }
}

export function leerMiNivel(): number | undefined {
  try {
    const n = Number(localStorage.getItem(CLAVE));
    return n >= 1 && n <= NIVEL_MAX ? Math.floor(n) : undefined;
  } catch {
    return undefined;
  }
}

/** «Jesús · Nv 12» (o solo el nombre si no se sabe el nivel). */
export const conNivel = (nombre: string, nivel?: number) => (nivel ? `${nombre} · Nv ${nivel}` : nombre);
